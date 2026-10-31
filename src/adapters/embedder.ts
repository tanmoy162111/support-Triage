export interface Embedder {
  readonly name: string;
  embed(texts: string[]): Promise<number[][]>;
}
