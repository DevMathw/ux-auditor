import { parse } from "node-html-parser";
import type { PageInfo } from "./types";

export function extractPageInfo(html: string): PageInfo {
  const root = parse(html);

  const title = root.querySelector("title")?.text?.trim() ?? "";
  const metaDesc =
    root
      .querySelector('meta[name="description"]')
      ?.getAttribute("content")
      ?.trim() ?? "";

  const h1s = root
    .querySelectorAll("h1")
    .map((el) => el.text.trim())
    .filter(Boolean)
    .slice(0, 3);

  const h2s = root
    .querySelectorAll("h2")
    .map((el) => el.text.trim())
    .filter(Boolean)
    .slice(0, 5);

  const imgs = root.querySelectorAll("img");
  const imgsNoAlt = imgs.filter(
    (img) => !img.getAttribute("alt")
  ).length;

  const langAttr =
    root.querySelector("html")?.getAttribute("lang") ?? "";
  const metaViewport =
    root
      .querySelector('meta[name="viewport"]')
      ?.getAttribute("content") ?? "";

  const lowerHtml = html.toLowerCase();
  const hasSkipLink =
    lowerHtml.includes("skip") && lowerHtml.includes("main");
  const hasARIA = lowerHtml.includes("aria-");

  const bodyText = root.querySelector("body")?.text?.slice(0, 1500) ?? "";

  return {
    title,
    metaDesc,
    h1s,
    h2s,
    imgCount: imgs.length,
    imgsNoAlt,
    linkCount: root.querySelectorAll("a").length,
    btnCount: root.querySelectorAll(
      'button, [role="button"], input[type="submit"]'
    ).length,
    formCount: root.querySelectorAll("form").length,
    labelCount: root.querySelectorAll("label").length,
    inputCount: root.querySelectorAll("input, select, textarea").length,
    langAttr,
    metaViewport,
    hasSkipLink,
    hasARIA,
    navCount: root.querySelectorAll("nav").length,
    mainCount: root.querySelectorAll("main").length,
    footerCount: root.querySelectorAll("footer").length,
    bodyText,
  };
}