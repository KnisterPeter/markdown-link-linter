/**
 * @typedef {import("mdast").Link} Link
 */
import Fs from "node:fs";
import Path from "node:path";
import remarkParse from "remark-parse";
import sade from "sade";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { VFile } from "vfile";
import pkg from "./package.json" with { type: "json" };

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

sade(pkg.name)
  .version(pkg.version)
  .option("--ignore", "Glob of files to ignore")
  .command("run <glob>")
  .action((args, opts) => {
    const ignoredFiles = (opts.ignore ? Fs.globSync(opts.ignore) : []).map(
      (path) => Path.join(process.cwd(), path),
    );

    if (!Array.isArray(args)) args = [args];
    let glob = args?.[0] ?? "**/*.md";
    if (glob === ".") glob = "**/*.md";

    for (const ent of Fs.globSync(glob, {
      withFileTypes: true,
      exclude: (file) =>
        ignoredFiles.includes(Path.join(file.parentPath, file.name)),
    })) {
      const path = Path.join(ent.parentPath, ent.name);
      const file = new VFile({
        path,
        value: Fs.readFileSync(path, "utf8"),
      });
      pipeline().runSync(pipeline().parse(file), file);
    }
  })
  .parse(process.argv);
