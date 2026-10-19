// This build's identity for Versus' Hello and codes, from vite.config.ts's
// defines. Outside Vite (the balance runner under plain Node) they fall back,
// so importing the net code never throws.

/** FNV-1a of src/sim (less testing/) and src/content: two builds play each other only when theirs match. */
export const SIM_HASH: string = typeof __SIM_HASH__ === 'string' ? __SIM_HASH__ : '00000000';
/** The git commit, shown in the version message. */
export const BUILD: string = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';
