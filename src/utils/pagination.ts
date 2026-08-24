export interface CursorData {
  s: string; // startTime in ISO string format
  i: string; // id
}

export function encodeCursor(startTime: Date, id: string): string {
  const payload: CursorData = {
    s: startTime.toISOString(),
    i: id,
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

export function decodeCursor(cursor: string): CursorData {
  try {
    const jsonStr = Buffer.from(cursor, "base64").toString("utf-8");
    const data = JSON.parse(jsonStr) as CursorData;
    if (!data.s || !data.i) {
      throw new Error("Invalid cursor structure");
    }
    return data;
  } catch {
    throw new Error(`Invalid pagination cursor: ${cursor}`);
  }
}
