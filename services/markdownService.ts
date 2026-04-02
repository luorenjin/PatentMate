import { marked } from "marked";
import katex from "katex";

// Configure marked options
marked.setOptions({
  gfm: true, // GitHub Flavored Markdown
  breaks: true, // Convert \n to <br>
});

/**
 * Renders a string containing Markdown and LaTeX formulas into HTML.
 * 
 * Strategy:
 * 1. Extract LaTeX parts ($...$ and $$...$$) and replace them with temporary tokens.
 * 2. Render the Markdown text using 'marked'.
 * 3. Replace the tokens back with rendered HTML from 'katex'.
 * 
 * This prevents 'marked' from messing up LaTeX syntax (like underscores).
 */
export const renderMarkdown = (text: string): string => {
  if (!text) return "";

  const mathSegments: { token: string; html: string }[] = [];
  let tokenIndex = 0;

  // Helper to protect math content
  const protectMath = (str: string, regex: RegExp, displayMode: boolean) => {
    return str.replace(regex, (match, equation) => {
      const token = `__MATH_TOKEN_${tokenIndex++}__`;
      try {
        const html = katex.renderToString(equation, {
          throwOnError: false,
          displayMode: displayMode,
          output: 'html', // Output HTML for accessibility
        });
        mathSegments.push({ token, html });
        return token;
      } catch (e) {
        console.error("KaTeX error:", e);
        return match; // Return original if error
      }
    });
  };

  // 1. Protect Block Math $$...$$
  let protectedText = protectMath(text, /\$\$([\s\S]+?)\$\$/g, true);

  // 2. Protect Inline Math $...$ (Careful not to match empty $$, though step 1 handles it mostly)
  // Using a simpler regex for inline math that avoids common false positives
  protectedText = protectMath(protectedText, /\$([^$\n]+?)\$/g, false);

  // 3. Render Markdown
  // marked returns a Promise if async is on, but sync by default for strings
  let html = marked.parse(protectedText) as string;

  // 4. Restore Math
  mathSegments.forEach(({ token, html: mathHtml }) => {
    html = html.replace(token, mathHtml);
  });

  return html;
};
