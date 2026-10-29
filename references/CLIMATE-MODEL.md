# Climate model references

## Greenhouse climate model

Vanthoor, B. H. E., Stanghellini, C., van Henten, E. J., & de Visser, P. H. B.
(2011). A methodology for model-based greenhouse design: Part 1, a greenhouse
climate model for a broad range of designs and climates. *Biosystems
Engineering, 110*(4), 363–377. <https://doi.org/10.1016/j.biosystemseng.2011.06.001>.

`src/lib/sim/environment-climate.ts` uses this work as methodological context
for a deterministic daily steady-state estimate. The browser model is not a
port of Vanthoor's full hourly model; the constants and simplifications are
listed beside the implementation and in `quality/SPEC-CORE-LOOP.md` §2.
