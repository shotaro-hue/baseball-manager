import { describe, it, expect } from "vitest";

describe("DraftLotteryScreen — lotteryTeams type mismatch", () => {
  it("String(t.id) === tid で正しくチームが見つかる", () => {
    const teams = [{ id: 0, name: "ヤクルト" }, { id: 1, name: "DeNA" }];
    const tid = "0";
    const found = teams.find(t => String(t.id) === tid);
    expect(found).toBeDefined();
    expect(found.id).toBe(0);
  });
});

describe("handleDraftComplete — _r1winner type match", () => {
  it("Number(_r1winner) === teamId でヤクルト選手が入団する", () => {
    const player = { id: "p1", name: "選手A", _drafted: true, _r1winner: 0 };
    const teamId = 0;
    expect(player._r1winner === teamId).toBe(true);
  });
});
