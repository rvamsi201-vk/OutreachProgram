export class ChunkingService {
  chunk(text: string, targetWords = 650, overlapRatio = 0.12) {
    const words = text.split(/\s+/).filter(Boolean);
    const overlap = Math.max(1, Math.floor(targetWords * overlapRatio));
    const chunks: string[] = [];
    for (let start = 0; start < words.length; start += targetWords - overlap) {
      const chunk = words.slice(start, start + targetWords).join(' ');
      if (chunk.trim()) chunks.push(chunk);
      if (start + targetWords >= words.length) break;
    }
    return chunks;
  }
}
