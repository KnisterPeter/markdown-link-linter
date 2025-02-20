/**
 * @typedef {import("mdast").Link} Link
 */
import Fs from "node:fs";
import Path from "node:path";
import { fileURLToPath } from "node:url";
import remarkParse from "remark-parse";
import sade from "sade";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { VFile } from "vfile";
import pkg from "./package.json" with { type: "json" };

/**
 * @param {string} fragment
 * @param {string} base
 * @returns {URL}
 */
export function createUrl(fragment, base) {
  if (URL.canParse(fragment)) return new URL(fragment);
  try {
    return new URL(`file:${Path.resolve(base, fragment)}`);
  } catch {
    throw new Error(`Unable to create URL from ${fragment} and ${base}`);
  }
}

/**
 * @param {Link} node
 * @param {VFile} file
 */
function linkChecker(node, file) {
  /** @type {URL} */
  let url;
  try {
    url = createUrl(node.url, file.dirname ?? file.cwd);
  } catch (err) {
    console.warn(`::error file=${file.path}::${String(err)}`);
    return;
  }

  if (url.protocol !== "file:") return;

  const path = fileURLToPath(url);
  if (!Fs.existsSync(path)) {
    const { line, column } = node.position?.start ?? {};
    const { line: endLine, column: endColumn } = node.position?.end ?? {};
    console.log(
      `::warning file=${file.path},line=${line},col=${column},endLine=${endLine},endColumn=${endColumn}::Invalid link to ${node.url}`,
    );
  }
}

function main() {
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
}

if (process.argv[1] === import.meta.filename) {
  main();
}
