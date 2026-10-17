/** A value that survives a JSON round trip unchanged. GameState and the command log are made of these. */
export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

/** A build cell as [col, row]. */
export type Cell = readonly [col: number, row: number];
