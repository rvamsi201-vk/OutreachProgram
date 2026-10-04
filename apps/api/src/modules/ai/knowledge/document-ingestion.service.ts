import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { AiRepository } from '../../../repositories/ai.repository.js';
import { LLMProviderFactory } from '../providers/llm-provider.factory.js';
import { ChunkingService } from './chunking.service.js';

export class DocumentIngestionService {
  constructor(
    private readonly repo = new AiRepository(),
    private readonly chunker = new ChunkingService(),
    private readonly llm = new LLMProviderFactory().createFromEnv(),
  ) {}

  async ingest(documentId: string) {
    const document = await this.repo.findDocument(documentId);
    if (!document) return;
    await this.repo.updateDocument(documentId, { status: 'PROCESSING' });
    try {
      const text = await this.extractText(document);
      if (!text.trim()) throw new Error('No extractable text found');
      const chunks = this.chunker.chunk(text);
      const embeddings = await this.llm.embed(chunks);
      const summary = await this.summarize(text, document.fileName, document.sourceType);
      await this.repo.replaceChunks(document.id, chunks.map((content, index) => ({
        organizationId: document.organizationId,
        knowledgeBaseId: document.knowledgeBaseId,
        documentId: document.id,
        chunkIndex: index,
        content,
        embedding: embeddings[index]!,
        metadata: { sourceType: document.sourceType, fileName: document.fileName, summary },
      })));
      await this.repo.updateDocument(documentId, { status: 'READY', content: text, summary, error: null });
    } catch (error) {
      await this.repo.updateDocument(documentId, {
        status: 'FAILED',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async extractText(document: NonNullable<Awaited<ReturnType<AiRepository['findDocument']>>>) {
    if (document.content) return document.content;
    if (document.sourceType === 'URL' && document.sourceUrl) {
      const response = await fetch(document.sourceUrl);
      if (!response.ok) throw new Error(`URL fetch failed with ${response.status}`);
      return htmlToText(await response.text());
    }
    if (!document.filePath) return document.content ?? '';
    const extension = extname(document.fileName).toLowerCase();
    const buffer = await readFile(document.filePath);
    if (extension === '.txt' || extension === '.md') return buffer.toString('utf8');
    if (extension === '.docx') {
      const result = await mammoth.extractRawText({ path: document.filePath });
      return result.value;
    }
    if (extension === '.pdf') {
      const parser = new PDFParse({ data: buffer });
      try {
        const result = await parser.getText();
        return result.text;
      } finally {
        await parser.destroy();
      }
    }
    throw new Error(`Unsupported document type: ${extension || document.sourceType}`);
  }

  private async summarize(text: string, title: string, sourceType: string) {
    const fallback = compact(text).slice(0, 900);
    try {
      const output = await this.llm.generate({
        system: [
          'Summarize CRM knowledge for a sales AI agent.',
          'Focus on organization details, product/service facts, pricing constraints, audience, objections, policies, and claims the agent can safely use.',
          'Return a concise plain-text summary under 180 words.',
        ].join(' '),
        messages: [{
          role: 'user',
          content: `Title: ${title}\nType: ${sourceType}\n\nContent:\n${text.slice(0, 12_000)}`,
        }],
      });
      return compact(output.text).slice(0, 1500) || fallback;
    } catch {
      return fallback;
    }
  }
}

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function compact(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}
