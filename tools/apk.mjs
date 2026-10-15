// `pnpm apk`: build the signed release APK and install it on the phone over USB.
// First run also installs the Android SDK packages and creates the signing keystore.
//   pnpm apk            build + install
//   pnpm apk --no-install   build only
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const JAVA_HOME = process.env.JAVA_HOME ?? '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home';
const ANDROID_HOME = process.env.ANDROID_HOME ?? '/opt/homebrew/share/android-commandlinetools';
const SDK_PACKAGES = ['platform-tools', 'platforms;android-36', 'build-tools;36.0.0'];
const KEY_DIR = join(homedir(), '.config', 'tavern-td');
const APK = 'android/app/build/outputs/apk/release/app-release.apk';

const env = {
  ...process.env,
  JAVA_HOME,
  ANDROID_HOME,
  ANDROID_SDK_ROOT: ANDROID_HOME,
  PATH: [join(JAVA_HOME, 'bin'), join(ANDROID_HOME, 'platform-tools'), join(ANDROID_HOME, 'cmdline-tools/latest/bin'), process.env.PATH].join(':'),
};

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', env, ...opts });

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

function checkTools() {
  if (!existsSync(join(JAVA_HOME, 'bin', 'java'))) fail(`No JDK at ${JAVA_HOME}. Run: brew install openjdk@21`);
  if (!existsSync(join(ANDROID_HOME, 'cmdline-tools'))) fail(`No Android SDK at ${ANDROID_HOME}. Run: brew install --cask android-commandlinetools`);
}

function ensureSdk() {
  const missing = SDK_PACKAGES.filter((p) => !existsSync(join(ANDROID_HOME, ...p.split(';'))));
  if (missing.length === 0) return;
  console.log(`Installing Android SDK packages: ${missing.join(', ')}`);
  run('sh', ['-c', 'yes | sdkmanager --licenses > /dev/null']);
  run('sdkmanager', missing);
}

function ensureKeystore() {
  const props = join(KEY_DIR, 'keystore.properties');
  if (existsSync(props)) return;
  mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
  const password = randomBytes(18).toString('base64url');
  run('keytool', [
    '-genkeypair', '-noprompt',
    '-keystore', join(KEY_DIR, 'release.jks'),
    '-alias', 'tavern-td',
    '-keyalg', 'RSA', '-keysize', '4096', '-validity', '36500',
    '-storepass', password, '-keypass', password,
    '-dname', 'CN=Tavern TD',
  ]);
  writeFileSync(props, `storeFile=release.jks\nstorePassword=${password}\nkeyAlias=tavern-td\nkeyPassword=${password}\n`, { mode: 0o600 });
  console.log(`\nCreated a signing keystore in ${KEY_DIR}. Back that folder up:`);
  console.log('without it, a new APK cannot update the installed app and its saves.\n');
}

checkTools();
ensureSdk();
ensureKeystore();
writeFileSync('android/local.properties', `sdk.dir=${ANDROID_HOME}\n`);

run('pnpm', ['build:android']);
run('pnpm', ['exec', 'cap', 'sync', 'android']);
run('./gradlew', ['assembleRelease'], { cwd: 'android' });
console.log(`\n✓ ${APK}`);

if (process.argv.includes('--no-install')) process.exit(0);

const devices = execFileSync('adb', ['devices'], { env, encoding: 'utf8' })
  .split('\n').slice(1).filter((l) => l.trim().endsWith('device'));
if (devices.length === 0) {
  fail('No phone found. Connect the S24 by USB with USB debugging on, accept the prompt on the phone, and run pnpm apk again.');
}
run('adb', ['install', '-r', APK]);
console.log('✓ Installed. Open Tavern TD from the app drawer.');
