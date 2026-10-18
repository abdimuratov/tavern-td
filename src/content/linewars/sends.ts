import { MAUL_CREEPS } from '../maul';
import { SEND_IDS, type LwCreepSpec, type LwSendSpec, type SendId } from './types';

// The ten Sends (docs/line-wars-design.md §8), made from Maul's creeps. HP is
// set here rather than by a Wave curve, so each Send's creep spec carries it.
// Three of Maul's names are on the research's lists to avoid, so the creeps
// those Sends buy are renamed here (Maul keeps its own): the Raider is the
// Brawler, the Frost Wolf the Sleet Hound, and the Wraith the Hollow. Every
// price, income, HP, bounty, Stock and restock is a [tune] number.

type Row = Omit<LwSendSpec, 'id'> & { readonly creepName: string };

const ROWS: Readonly<Record<SendId, Row>> = {
  snowlings: {
    name: 'Snowlings', creepName: 'Snowling', key: 'Z', creep: 'snowling', count: 3, price: 24, income: 2, hp: 16,
    bounty: 2, steals: 1, unlock: 20, cap: 6, restock: 5,
  },
  brawler: {
    name: 'Brawler', creepName: 'Brawler', key: 'X', creep: 'raider', count: 1, price: 40, income: 3, hp: 100,
    bounty: 6, steals: 1, unlock: 40, cap: 6, restock: 6,
  },
  sleet_hound: {
    name: 'Sleet Hound', creepName: 'Sleet Hound', key: 'C', creep: 'frost_wolf', count: 1, price: 60, income: 4, hp: 140,
    bounty: 8, steals: 1, unlock: 80, cap: 5, restock: 8,
  },
  troll: {
    name: 'Troll', creepName: 'Troll', key: 'V', creep: 'troll', count: 1, price: 90, income: 6, hp: 290,
    bounty: 10, steals: 1, unlock: 120, cap: 5, restock: 10,
  },
  hollow: {
    name: 'Hollow', creepName: 'Hollow', key: 'B', creep: 'wraith', count: 1, price: 120, income: 7, hp: 460,
    bounty: 12, steals: 1, unlock: 180, cap: 4, restock: 12,
  },
  brute: {
    name: 'Brute', creepName: 'Brute', key: 'A', creep: 'brute', count: 1, price: 160, income: 9, hp: 780,
    bounty: 16, steals: 1, unlock: 240, cap: 4, restock: 15,
  },
  harpies: {
    name: 'Harpies', creepName: 'Harpy', key: 'D', creep: 'harpy', count: 2, price: 200, income: 5, hp: 220,
    bounty: 8, steals: 1, unlock: 300, cap: 3, restock: 20,
  },
  ice_golem: {
    name: 'Ice Golem', creepName: 'Ice Golem', key: 'F', creep: 'golem', count: 1, price: 260, income: 13, hp: 1540,
    bounty: 20, steals: 1, unlock: 360, cap: 3, restock: 20,
  },
  warlord: {
    name: 'Tusked Warlord', creepName: 'Tusked Warlord', key: 'G', creep: 'warlord', count: 1, price: 500, income: 20, hp: 3900,
    bounty: 30, steals: 2, unlock: 480, cap: 2, restock: 45,
  },
  mammoth: {
    name: 'War Mammoth', creepName: 'War Mammoth', key: 'H', creep: 'mammoth', count: 1, price: 800, income: 28, hp: 7200,
    bounty: 40, steals: 3, unlock: 600, cap: 1, restock: 60,
  },
};

/** The Sends by id. */
export const LW_SENDS: Readonly<Record<SendId, LwSendSpec>> = Object.fromEntries(SEND_IDS.map((id) => {
  const r = ROWS[id];
  const spec: LwSendSpec = {
    id, name: r.name, key: r.key, creep: r.creep, count: r.count, price: r.price, income: r.income, hp: r.hp,
    bounty: r.bounty, steals: r.steals, unlock: r.unlock, cap: r.cap, restock: r.restock,
  };
  return [id, spec];
})) as Record<SendId, LwSendSpec>;

/** The Sends in menu order, cheapest first. */
export const SEND_LIST: readonly LwSendSpec[] = SEND_IDS.map((id) => LW_SENDS[id]);

/**
 * Line Wars' creep specs, keyed by Maul's creep ids so the board can draw
 * Maul's shapes. Each is Maul's creep with the Send's name, HP and steal, and
 * no core bounty: the defender's bounty is paid by the Game Mode.
 */
export const LW_CREEPS: Readonly<Record<string, LwCreepSpec>> = Object.fromEntries(SEND_IDS.map((id) => {
  const row = ROWS[id];
  const maul = MAUL_CREEPS[row.creep]!;
  const spec: LwCreepSpec = {
    ...maul, name: row.creepName, hp: row.hp, bounty: 0, leakCost: row.steals,
    maul: { ...maul.maul, lives: row.steals }, lw: { send: id },
  };
  return [row.creep, spec];
}));

/** The Send a Line Wars creep belongs to, by its creep spec; null for anything else. */
export function sendOfCreep(spec: string): LwSendSpec | null {
  return Object.hasOwn(LW_CREEPS, spec) ? LW_SENDS[LW_CREEPS[spec]!.lw.send] : null;
}

/** True when `id` names a Send. */
export function isSendId(id: unknown): id is SendId {
  return typeof id === 'string' && (SEND_IDS as readonly string[]).includes(id);
}
