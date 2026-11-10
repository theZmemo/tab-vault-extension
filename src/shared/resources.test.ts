import { describe, expect, it } from "vitest";
import {
  getCompletedTabTitle,
  getResourceDisplayTitle,
  getSavedTitleUpdate,
  isLikelyTransientPageTitle,
  selectHistoricalSavedTitle,
} from "./resources";

describe("resource titles", () => {
  it("prefers custom, saved, then latest page titles", () => {
    expect(
      getResourceDisplayTitle({
        customTitle: "手工名称",
        savedTitle: "保存时名称",
        title: "飞书云文档",
      }),
    ).toBe("手工名称");
    expect(
      getResourceDisplayTitle({
        savedTitle: "保存时名称",
        title: "飞书云文档",
      }),
    ).toBe("保存时名称");
    expect(getResourceDisplayTitle({ title: "最新网页标题" })).toBe(
      "最新网页标题",
    );
  });

  it("recovers the final title observed before the resource was saved", () => {
    expect(
      selectHistoricalSavedTitle(
        {
          title: "飞书云文档",
          domain: "bytedance.larkoffice.com",
        },
        [
          { title: "飞书云文档", createdAt: 100 },
          { title: "G1 治理周会复盘", createdAt: 200 },
          { title: "飞书云文档", createdAt: 400 },
        ],
        250,
      ),
    ).toBe("G1 治理周会复盘");
  });

  it("only treats a completed non-empty tab title as stable", () => {
    expect(
      getCompletedTabTitle({ status: "loading", title: "Loading..." }),
    ).toBeUndefined();
    expect(
      getCompletedTabTitle({ status: "complete", title: "  Final report  " }),
    ).toBe("Final report");
    expect(
      getCompletedTabTitle({ status: "complete", title: "   " }),
    ).toBeUndefined();
    expect(
      getCompletedTabTitle({ status: undefined, title: "Final report" }, true),
    ).toBe("Final report");
    expect(
      getCompletedTabTitle({
        status: "complete",
        title: "Docs",
        url: "https://bytedance.larkoffice.com/docx/example",
      }),
    ).toBeUndefined();
    expect(
      getCompletedTabTitle({
        status: "complete",
        title: "Docs",
        url: "https://example.com/docs",
      }),
    ).toBe("Docs");
  });

  it("recognizes known application shell titles without blocking real titles", () => {
    expect(isLikelyTransientPageTitle("dorado_fe")).toBe(true);
    expect(isLikelyTransientPageTitle("Loading...")).toBe(true);
    expect(
      isLikelyTransientPageTitle(
        "Docs",
        "https://bytedance.larkoffice.com/docx/example",
      ),
    ).toBe(true);
    expect(
      isLikelyTransientPageTitle("Docs", "https://example.com/docs"),
    ).toBe(false);
    expect(
      isLikelyTransientPageTitle(
        "G1 治理周报",
        "https://bytedance.larkoffice.com/docx/example",
      ),
    ).toBe(false);
  });

  it("keeps a pending save until a stable title is available", () => {
    expect(
      getSavedTitleUpdate({ stableTitle: undefined, savedTitleAt: undefined }, 100),
    ).toEqual({
      savedTitleAt: 100,
      savedTitleProvisional: true,
    });
    expect(
      getSavedTitleUpdate(
        { stableTitle: "Final report", savedTitleAt: 100 },
        200,
      ),
    ).toEqual({
      savedTitle: "Final report",
      savedTitleAt: 100,
      savedTitleProvisional: true,
    });
    expect(
      getSavedTitleUpdate(
        { stableTitle: "Final report", savedTitleAt: 100 },
        200,
        "final",
      ),
    ).toEqual({
      savedTitle: "Final report",
      savedTitleAt: 100,
      savedTitleProvisional: false,
    });
  });
});
