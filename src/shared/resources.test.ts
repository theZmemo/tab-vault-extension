import { describe, expect, it } from "vitest";
import {
  getResourceDisplayTitle,
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
});
