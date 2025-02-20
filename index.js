/**
 * @typedef {import("mdast").Link} Link
 */

import Fs from "node:fs";
import Path from "node:path";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { VFile } from "vfile";

/**
 * @param {Link} node
 * @param {VFile} file
 */
function linkChecker(node, file) {
  if (
    !URL.canParse(node.url) &&
    !node.url.startsWith("/") &&
    !Fs.existsSync(Path.resolve(file.dirname ?? file.cwd, node.url))
  ) {
    const { line, column } = node.position?.start ?? {};
    console.log(
      `::warning file=${file.path},line=${line},col=${column}::Invalid link to ${node.url}`,
    );
  }
}

const pipeline = unified()
  .use(remarkParse)
  .use(
    () => (tree, file) =>
      visit(tree, "link", (node) => linkChecker(node, file)),
  );

for (const path of Fs.globSync("**/*.md")) {
  const file = new VFile({
    path,
    value: Fs.readFileSync(path, "utf8"),
  });
  pipeline().runSync(pipeline().parse(file), file);
}
