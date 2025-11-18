import stripAnsi from "strip-ansi";

export const alignedLog = (...args) => console.log(centerText(...args))

export const centerText = (text, inputWidth) => {
  const defaultWidth = process?.stdout?.columns ?? 80;
  
  const width = inputWidth || defaultWidth;
  const lines = String(text).split("\n");

  // Find the single longest line in the block
  let maxWidth = 0;
  for (const line of lines) {
    const lineWidth = stripAnsi(line).length;
    if (lineWidth > maxWidth) maxWidth = lineWidth;
  }

  // Calculate the padding based on the longest line
  const blockPaddingCount = Math.floor((width - maxWidth) / 2);
  const blockPadding = " ".repeat(blockPaddingCount > 0 ? blockPaddingCount : 0);

  // the block padding to each line
  const centeredLines = lines.map(line => blockPadding + line);

  return centeredLines.join("\n");
}