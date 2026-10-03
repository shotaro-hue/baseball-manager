# Mobile Calm Dugout — first implementation pass

final result: blocked

Approved targets: mobile home, roster, player detail and batch-result mocks from the 2026-09-30 conversation (390 × 844 CSS target). Source files: exec-4a511f8f-3e45-4bf2-9736-a693691ff520.png, exec-aa023279-1043-4de5-8194-96eabef36665.png, exec-577ff1b9-35c0-499b-b223-aadb641f3663.png, exec-c6270fb9-128f-4623-ae05-4c81f5f17dca.png under /workspace/scratch/66c5379939ed/generated_images/.

## Blocker
Managed preview startup failed with `sh: 1: vite: not found`. Local build and tests resolve the existing dependency symlink successfully. No browser screenshots, interactions, console check, density normalization or full/focused visual comparison were completed. Typography, spacing, colors, assets and content fidelity remain unverified. User explicitly opted to perform visual review; publish as draft, not visually verified completion.

## Scope
Mobile home, tap-based lineup order/replacement, fullscreen player detail, progressive seasonal metrics, batch results, five primary navigation destinations. Desktop home is retained. All existing administration tabs remain reachable. No simulation cancellation/checkpoint or data-retention changes.

## Intentional differences and remaining work
Detailed roster/pitching/development controls remain in an expandable existing panel. Batted-ball and career analysis retain dark inner surfaces; schedule, individual result and administration screens still need full visual unification. Team labels use existing product identity rather than invented image assets. The mock player-history list and games-behind changes are not fabricated when absent from component inputs.

## Manual review before merge
- Check 390px and 360px layouts, long names, safe areas and no page-wide horizontal overflow.
- Open simulation settings, choose count/automation, run and verify progress/results.
- Reorder/replace players, confirm assigned defense and validate lineup before play.
- Open/close player detail from a scrolled roster; confirm focus/scroll restoration and access to advanced analysis.
- Open batch game details; return to roster/home.
- Check every old tab under the five navigation groups and desktop regressions.

This PR is the first implementation pass, not completion of the entire UI refresh.
