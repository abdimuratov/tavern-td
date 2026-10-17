import { isNative } from '../../platform/native';
import type { Settings } from '../../platform/storage';
import { appActions, settings } from '../state';

function Switch({ id, on, label, onChange }: { id: string; on: boolean; label: string; onChange(on: boolean): void }) {
  return (
    <button
      type="button"
      role="switch"
      class={`switch${on ? ' on' : ''}`}
      aria-checked={on}
      aria-label={label}
      data-testid={`setting-${id}`}
      onClick={() => onChange(!on)}
    >
      <span class="knob" />
    </button>
  );
}

/** Sound, volume, haptics (Android), default speed and the grid. Each change is saved and applied at once. */
export function SettingsPanel() {
  const st = settings.value;
  const set = (patch: Partial<Settings>): void => appActions.value?.updateSettings({ ...st, ...patch });
  return (
    <div class="settings" data-testid="settings">
      <div class="setting">
        <span>Sound</span>
        <Switch id="sound" label="Sound" on={st.sound} onChange={(sound) => set({ sound })} />
      </div>
      <div class={`setting${st.sound ? '' : ' off'}`}>
        <span>Volume</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(st.volume * 100)}
          disabled={!st.sound}
          aria-label="Volume"
          data-testid="setting-volume"
          onInput={(e) => set({ volume: Number((e.currentTarget as HTMLInputElement).value) / 100 })}
        />
      </div>
      {isNative && (
        <div class="setting">
          <span>Haptics</span>
          <Switch id="haptics" label="Haptics" on={st.haptics} onChange={(haptics) => set({ haptics })} />
        </div>
      )}
      <div class="setting">
        <span>Default speed</span>
        <div class="seg" role="group" aria-label="Default speed">
          {([1, 2, 3] as const).map((n) => (
            <button
              key={n}
              type="button"
              class={`btn${st.defaultSpeed === n ? ' active' : ''}`}
              aria-pressed={st.defaultSpeed === n}
              onClick={() => set({ defaultSpeed: n })}
            >
              {n}×
            </button>
          ))}
        </div>
      </div>
      <div class="setting">
        <span>Show grid</span>
        <Switch id="grid" label="Show grid" on={st.showGrid} onChange={(showGrid) => set({ showGrid })} />
      </div>
    </div>
  );
}
