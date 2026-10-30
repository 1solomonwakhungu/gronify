// Scalars are kept as latin1 strings of their UTF-8 bytes (and object keys as the
// bytes of their escaped JSON form), so they can be written back byte for byte.
export type TreeNode = string | TreeObject | TreeArray;

export class TreeObject {
  readonly entries = new Map<string, TreeNode>();
}

export class TreeArray {
  readonly items: Array<TreeNode | undefined> = [];
}

export function byteString(text: string): string {
  return Buffer.from(text, "utf8").toString("latin1");
}
