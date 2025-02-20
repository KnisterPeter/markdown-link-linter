import GithubSlugger from "github-slugger";
import { toString as mdAstToString } from "mdast-util-to-string";
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

function remarkLinkChecker() {
  const slugger = new GithubSlugger();
  const stop = new Error();

  return remarkLinkChecker;

  /**
   *
   * @param {import("mdast").Node} tree
   * @param {VFile} file
   */
  function remarkLinkChecker(tree, file) {
    visit(tree, "link", (node) => {
      try {
        linkChecker(node, file);
      } catch (err) {
        if (err === stop) return;
        throw err;
      }
    });

    /**
     * @param {import("mdast").Link} node
     * @param {VFile} file
     */
    function linkChecker(node, file) {
      /** @type {URL} */
      let url;
      try {
        url = createUrl(node.url, file.dirname ?? file.cwd);
      } catch (err) {
        console.warn(`::error file=${file.path}::${String(err)}`);
        throw stop;
      }

      // exclude external links
      if (url.protocol !== "file:") return;

      const path = fileURLToPath(url);
      if (!Fs.existsSync(path))
        createIssue(`Invalid link to ${node.url} (file not found)`, node, file);

      if (url.hash) checkSlug(path, url.hash.slice(1), node, file);
    }
  }

  /**
   *
   * @param {string} path
   * @param {string} slug
   * @param {import("mdast").Link} node
   * @param {VFile} file
   */
  function checkSlug(path, slug, node, file) {
    slugger.reset();
    /** @type {string[]} */
    const slugs = [];

    const linkedFile = new VFile({
      path,
      value: Fs.readFileSync(path, "utf8"),
    });
    const pipeline = unified()
      .use(remarkParse)
      .use(() => (tree) => {
        visit(tree, "heading", (node) => {
          slugs.push(slugger.slug(mdAstToString(node)));
        });
      });
    pipeline.runSync(pipeline.parse(linkedFile), linkedFile);

    if (!slugs.includes(slug)) {
      return createIssue(
        `Invalid link to ${node.url} (slug not found)`,
        node,
        file,
      );
    }
  }

  /**
   * @param {string} message
   * @param {import("mdast").Link} node
   * @param {VFile} file
   */
  function createIssue(message, node, file) {
    const { line, column } = node.position?.start ?? {};
    const { line: endLine, column: endColumn } = node.position?.end ?? {};
    console.log(
      `::warning file=${file.path},line=${line},col=${column},endLine=${endLine},endColumn=${endColumn}::${message}`,
    );
    throw stop;
  }
}

function main() {
  const linkCheckerPipeline = unified().use(remarkParse).use(remarkLinkChecker);

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
        linkCheckerPipeline.runSync(linkCheckerPipeline.parse(file), file);
      }
    })
    .parse(process.argv);
}

if (process.argv[1] === import.meta.filename) {
  main();
}
