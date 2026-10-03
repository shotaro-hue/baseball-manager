import React from "react";
import { create, act } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi } from "vitest";
import { MobileHome } from "./MobileHome";
import { MobileRoster } from "./MobileRoster";
import { BatchResultScreen } from "./BatchResult";
import HubBottomNav from "./hub/HubBottomNav";
const p = { id: 0, name: "\u9078\u624B\u30BC\u30ED", pos: "\u4E8C\u5841\u624B", condition: 85, batting: { contact: 70, power: 60 } };
const bench = { ...p, id: 2, name: "\u63A7\u3048\u9078\u624B", pos: "\u904A\u6483\u624B" };
const team = { id: 0, name: "\u81EA\u8ECD", short: "\u81EA\u8ECD", league: "C", wins: 1, losses: 0, players: [p, bench], lineup: [0], fieldingNoDh: { 0: "\u4E8C\u5841\u624B" }, rotation: [] };
const opp = { ...team, id: 1, name: "\u76F8\u624B", players: [] };
const schedule = { 1: { date: { month: 3, day: 27 }, matchups: [{ homeId: 0, awayId: 1 }] } };
const content = (n) => typeof n === "string" ? n : (n.children || []).map(content).join("");
const button = (view, label) => view.root.findAllByType("button").find((n) => content(n) === label);
describe("mobile flow", () => {
  it("opens simulation settings and passes the chosen count to the existing action", () => {
    const run = vi.fn();
    let view;
    act(() => {
      view = create(/* @__PURE__ */ React.createElement(MobileHome, { myTeam: team, teams: [team, opp], schedule, gameDay: 1, year: 2026, onBatchSim: run }));
    });
    act(() => button(view, "\u307E\u3068\u3081\u3066\u9032\u3081\u308B").props.onClick());
    act(() => button(view, "\u307E\u3068\u3081\u3066\u30B7\u30E0").props.onClick());
    expect(run).toHaveBeenCalledWith(5, false);
    act(() => view.unmount());
  });
  it("disables every simulation start while processing and shows progress", () => {
    const html = renderToStaticMarkup(/* @__PURE__ */ React.createElement(MobileHome, { myTeam: team, teams: [team, opp], schedule, gameDay: 1, batchProgress: { current: 2, total: 5 } }));
    expect(html).toContain("2/5");
    expect(html).toContain('role="status"');
    expect(html).toMatch(/disabled=""[^>]*>まとめてシム/);
  });
  it("uses saved score fields and newest-first result ordering", () => {
    const html = renderToStaticMarkup(/* @__PURE__ */ React.createElement(MobileHome, { myTeam: team, teams: [team, opp], schedule, gameDay: 1, recentResults: [{ gameNo: 3, oppName: "\u6700\u65B0", myScore: 4, oppScore: 2, won: true }, { gameNo: 2, oppName: "\u524D\u65E5", myScore: 0, oppScore: 1 }] }));
    expect(html).toContain("4 \u2212 2");
    expect(html.indexOf("\u6700\u65B0")).toBeLessThan(html.indexOf("\u524D\u65E5"));
  });
  it("replaces ID zero while retaining the assigned fielding position", () => {
    const replace = vi.fn();
    const open = vi.fn();
    let view;
    act(() => {
      view = create(/* @__PURE__ */ React.createElement(MobileRoster, { team, onReplaceLineup: replace, onPlayerClick: open }));
    });
    act(() => button(view, "\u5165\u66FF").props.onClick());
    act(() => button(view, "\u8D77\u7528").props.onClick());
    expect(replace).toHaveBeenCalledWith([{ id: 2, pos: "\u4E8C\u5841\u624B" }]);
    expect(team.lineup).toEqual([0]);
    act(() => view.unmount());
  });
  it("blocks injured replacement candidates and allows returning without mutation", () => {
    const replace = vi.fn();
    let view;
    act(() => {
      view = create(/* @__PURE__ */ React.createElement(MobileRoster, { team: { ...team, players: [p, { ...bench, injuryDaysLeft: 2 }] }, onReplaceLineup: replace }));
    });
    act(() => button(view, "\u5165\u66FF").props.onClick());
    expect(button(view, "\u8D77\u7528").props.disabled).toBe(true);
    act(() => button(view, "\u8D77\u7528").props.onClick());
    expect(replace).not.toHaveBeenCalled();
    act(() => button(view, "\u6253\u7DDA\u306B\u623B\u308B").props.onClick());
    expect(button(view, "\u5165\u66FF")).toBeTruthy();
    act(() => view.unmount());
  });
  it("routes order changes without relying on drag gestures", () => {
    const change = vi.fn();
    let view;
    act(() => {
      view = create(/* @__PURE__ */ React.createElement(MobileRoster, { team, onSetLineupOrder: change }));
    });
    act(() => view.root.findByType("select").props.onChange({ target: { value: "1" } }));
    expect(change).toHaveBeenCalledWith(0, 1);
    act(() => view.unmount());
  });
  it("counts draws separately from losses in the result summary", () => {
    const html = renderToStaticMarkup(/* @__PURE__ */ React.createElement(BatchResultScreen, { results: [{ won: true, score: { my: 3, opp: 1 } }, { won: false, drew: true, score: { my: 2, opp: 2 } }], myTeam: team, isBatchProcessing: false }));
    expect(html).toContain("1\u52DD 0\u6557 1\u5206");
  });
  it("keeps a navigation selection accessible", () => {
    const html = renderToStaticMarkup(/* @__PURE__ */ React.createElement(HubBottomNav, { sections: [{ id: "home", label: "\u30DB\u30FC\u30E0" }, { id: "other", label: "\u305D\u306E\u4ED6" }], currentPrimarySection: "home", tabBadges: {} }));
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain("\u6B21\u3078\u9032\u3080");
  });
});
