import { KafkaEditor } from './core/editor.js';
import { EditorState } from './core/state.js';
import { registerBlock, getBlock, listBlocks } from './core/registry.js';
import { ParagraphBlock } from './blocks/paragraph.js';
import { HeadingBlock } from './blocks/heading.js';
import { ImageBlock } from './blocks/image.js';
import { CodeBlock } from './blocks/code.js';
import { QuoteBlock } from './blocks/quote.js';
import { ListBlock } from './blocks/list.js';
import { ColumnsBlock } from './blocks/columns.js';

registerBlock(ParagraphBlock);
registerBlock(HeadingBlock);
registerBlock(ImageBlock);
registerBlock(CodeBlock);
registerBlock(QuoteBlock);
registerBlock(ListBlock);
registerBlock(ColumnsBlock);

export const Kafka = {
  registerBlock,
  getBlock,
  listBlocks,
};

export {
  KafkaEditor,
  EditorState,
  ParagraphBlock,
  HeadingBlock,
  ImageBlock,
  CodeBlock,
  QuoteBlock,
  ListBlock,
  ColumnsBlock,
};
