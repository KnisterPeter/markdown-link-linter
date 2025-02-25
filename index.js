import GithubSlugger from "github-slugger";
import { globSync } from "glob";
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

/**
 * @param {{results: {foundIssues: boolean}, error: boolean}} options
 */
function remarkLinkChecker({ results, error }) {
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
        let fragment = node.url;
        if (fragment.startsWith("#")) fragment = `${file.basename}${fragment}`;
        url = createUrl(fragment, file.dirname ?? file.cwd);
      } catch (err) {
        console.warn(`::error file=${file.path}::${String(err)}`);
        results.foundIssues = true;
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
    const type = error ? "error" : "warning";
    const { line, column } = node.position?.start ?? {};
    const { line: endLine, column: endColumn } = node.position?.end ?? {};
    console.log(
      `::${type} file=${file.path},line=${line},col=${column},endLine=${endLine},endColumn=${endColumn}::${message}`,
    );
    results.foundIssues = true;
    throw stop;
  }
}

function main() {
  sade(pkg.name)
    .version(pkg.version)
    .option("--ignore", "Glob of files to ignore")
    .option("--error", "Emit error instead of warning", false)
    .option("--fail-on-issue", "Fail process if issues are found", false)
    .command("run <glob>")
    .action((args, opts) => {
      const results = { foundIssues: false };

      const linkCheckerPipeline = unified()
        .use(remarkParse)
        .use(remarkLinkChecker, { results, error: opts.error ?? false });

      if (!Array.isArray(args)) args = [args];
      let glob = args?.[0] ?? "**/*.md";
      const stat = Fs.statSync(glob);
      if (stat.isDirectory()) glob = Path.join(glob, "**/*.md");

      let ignore = ["**/node_modules/**"];
      if (opts.ignore) {
        if (!Array.isArray(opts.ignore)) opts.ignore = [opts.ignore];
        ignore.push(...opts.ignore);
      }

      for (const path of globSync(glob, {
        ignore,
        absolute: true,
      })) {
        const file = new VFile({
          path,
          value: Fs.readFileSync(path, "utf8"),
        });
        linkCheckerPipeline.runSync(linkCheckerPipeline.parse(file), file);
      }

      if (opts["fail-on-issue"] && results.foundIssues) {
        process.exit(1);
      }
    })
    .parse(process.argv);
}

if (process.argv[1] === import.meta.filename) {
  main();
}
