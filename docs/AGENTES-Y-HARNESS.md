# Agentes y harnesses · cómo funciona por dentro

> **Propósito:** explicar qué pasa "debajo" cuando el reusable workflow corre. Útil para entender cómo razonan los críticos, por qué elegimos esta arquitectura y qué espacio hay para evolucionar.

---

## TL;DR

Este Action no inventa un harness de agentes propio: **compone dos harnesses oficiales** (Anthropic + OpenAI) más una función determinística que mezcla resultados. El valor está en el prompt opinionado y en la mezcla — no en infraestructura de agent loops.

---

## Hay 3 actores en el sistema

```
┌─────────────────────────────────────────────────┐
│  GitHub Actions Runner (Ubuntu)                 │
│                                                 │
│  ┌──────────────────┐   ┌──────────────────┐    │
│  │  AGENTE CLAUDE   │   │  AGENTE CODEX    │    │
│  │  ─────────────   │   │  ─────────────   │    │
│  │  LLM: Sonnet 4.6 │   │  LLM: GPT-5      │    │
│  │  Harness:        │   │  Harness:        │    │
│  │  claude-code-    │   │  codex CLI       │    │
│  │  action@v1       │   │  (modo exec)     │    │
│  └──────────────────┘   └──────────────────┘    │
│           │                       │             │
│           ▼                       ▼             │
│        JSON                    JSON             │
│           │                       │             │
│           └───────────┬───────────┘             │
│                       ▼                         │
│        ┌───────────────────────────────┐        │
│        │  MERGER (no es agente)        │        │
│        │  TypeScript determinístico    │        │
│        │  Just functions, no loop      │        │
│        └───────────────────────────────┘        │
└─────────────────────────────────────────────────┘
```

Importante: **"agente" ≠ "LLM"**. Un agente es **un LLM + su harness** (loop de razonamiento, tools allowlist, mecanismo de I/O). Un LLM por sí solo no es agente; es una función estadística que predice tokens.

---

## Capa 1 · Agente Claude

| Elemento | Detalle |
|---|---|
| **LLM** | `claude-sonnet-4-6` (override via input `claude_model`) |
| **Harness oficial** | [`anthropics/claude-code-action@v1`](https://github.com/anthropics/claude-code-action) — Claude Code corriendo headless en el runner de Ubuntu |
| **Cómo lo invocamos** | `uses: anthropics/claude-code-action@v1` con `prompt:` (path al archivo) + `claude_args:` (allowlist de tools y modelo) |
| **Loop interno del harness** | El estándar de Claude Code: el modelo razona, decide llamar un tool, recibe el resultado, vuelve a razonar, y así hasta decidir que terminó (último mensaje sin tool calls) |
| **Tools que le permitimos** | `Read`, `Write`, `Bash(cat:*)`, `Bash(ls:*)` (allowlist mínima — leer RFC, escribir JSON, listar dirs) |
| **Tools que NO le permitimos** | `Edit`, `Bash(*)`, MCP servers, acceso de red — no necesita modificar nada del repo consumidor |
| **Input al agente** | Prompt renderizado desde `prompts/adversarial-rfc.md` con `{{RFC_PATH}}` y `{{CRITERIA_PATH}}` substituidos por sed |
| **Output esperado** | Archivo `/tmp/claude-report.json` que el agente escribe vía tool `Write` |

**Es el mismo harness que se usa en Claude Code interactivo**, pero sin terminal: corre en CI, una sola tarea, autodecide cuándo terminar.

### Por qué esta allowlist específica

- `Read`: el agente necesita leer el RFC + la rúbrica.
- `Write`: necesita emitir el output JSON.
- `Bash(cat:*)` y `Bash(ls:*)`: permite explorar la estructura del repo si necesita encontrar archivos relacionados (ej. ADRs en `arch/docs/adrs/`).
- **No `Edit`** porque no queremos que modifique el RFC.
- **No `Bash(*)` libre** porque no debe ejecutar tests, scripts ni nada del repo.

---

## Capa 2 · Agente Codex

| Elemento | Detalle |
|---|---|
| **LLM** | `gpt-5` (override via input `codex_model`) |
| **Harness oficial** | [`@openai/codex` CLI](https://github.com/openai/codex) en modo `exec` (no-interactive) |
| **Cómo lo invocamos** | `codex exec -c model_reasoning_effort=<medium\|high> -c model=gpt-5 "<prompt>"` vía `Bun.spawn` |
| **Loop interno del harness** | El estándar de Codex: agente lee archivos con su propio sandbox tool, razona, emite a stdout |
| **Tools del sandbox Codex** | Read-only por default (lee archivos, ejecuta bash limitado). No le pasamos overrides — usamos los defaults de Codex |
| **Input al agente** | Mismo prompt que Claude (esto es clave: si los prompts difieren, `agreement_score` deja de ser interpretable) |
| **Output esperado** | stdout de Codex → nuestro `parseCodexOutput()` extrae el JSON (tolerante a code fences, prose preamble, JSON suelto entre texto) |

### Diferencia operativa vs Claude

| | Claude | Codex |
|---|---|---|
| Propietario del harness | Anthropic | OpenAI |
| Forma de invocación | GitHub Action (`uses:`) | CLI binario instalado en runner |
| Allowlist de tools | Nosotros la configuramos | Defaults de Codex (no la controlamos) |
| Output | Archivo que el agente escribe | stdout que nosotros parseamos |
| Sub-tools que usa | Read, Write, Bash | Sandbox file ops + bash |

Operacionalmente, Claude se siente "más declarativo" (vos le decís dónde dejar el archivo) y Codex "más procedural" (vos parseás lo que escupió).

---

## Capa 3 · Merger (NO es agente, por diseño)

| Elemento | Detalle |
|---|---|
| **Qué es** | Funciones puras de TypeScript: `mergeReports()`, `renderReport()`, CLI wrapper |
| **Qué tiene** | Tipos, una `Map<assertion_id, ...>`, ordenamiento por prioridad, render de markdown |
| **Qué NO tiene** | LLM, loop de agente, tools allowlist, ningún tipo de no-determinismo |
| **Por qué importa** | Es **predecible**, **testeable sin tokens**, **rápido** (9ms para 12 unit tests) |

### Regla de oro de diseño

> Cualquier cosa que pueda hacerse sin LLM, NO debe hacerse con LLM.

La mezcla de findings, el cálculo de `agreement_score`, el render del comment markdown, la decisión de qué postear — **todo eso es lógica simple**. Pasarlo por un LLM sería:
- Más caro (tokens innecesarios)
- Más lento (latencia del modelo)
- No-determinístico (el output cambia entre runs)
- Menos auditable (no podés escribir un test que pase consistentemente)

El merger captura los puntos donde la decisión es **inequívoca dada la entrada**. Solo lo que requiere **juicio sobre lenguaje natural** (¿el RFC contradice esta assertion?) va al agente.

---

## Cómo se compone el objetivo · review adversarial del RFC

```
1. GitHub PR toca arch/RFC.md
        ▼
2. Workflow YAML dispara 3 jobs
        ▼
3a. AGENTE CLAUDE          3b. AGENTE CODEX
    (harness oficial            (harness oficial
     de Anthropic)               de OpenAI)
        │                          │
        │   ambos leen el RFC,     │
        │   evalúan rúbrica,       │
        │   emiten JSON            │
        ▼                          ▼
4. JSON artifacts subidos a GH Actions artifact storage
        ▼
5. MERGER (función pura) descarga ambos, mezcla, decide:
   - coincidencias (alta confianza)
   - solo-claude (taste decision)
   - solo-codex (taste decision)
        ▼
6. PR comment posteado vía `gh pr comment`
```

Paso 3a y 3b corren **en paralelo** — son jobs independientes de GitHub Actions. El paso 5 espera a ambos (`needs: [claude, codex]`) pero usa `if: always()` para seguir aunque uno falle (el merger reporta "critic unavailable" en ese caso).

---

## Principios de diseño que están detrás

### 1. Reutilizar harnesses oficiales

No mantenemos infraestructura propia de agent loops. Anthropic mantiene el de Claude (con cada update de Claude Code, lo recibimos gratis). OpenAI mantiene el de Codex. **Cero código de "agent framework" de nuestra parte.**

### 2. El prompt es nuestra contribución, no el harness

El valor está en `prompts/adversarial-rfc.md` (qué le pedimos al agente) + el merger (cómo combinamos lo que devuelve). El **cómo el agente razona** es de Anthropic/OpenAI.

### 3. Tools allowlisted son la leash

Claude no puede modificar el RFC, no puede ejecutar código arbitrario, no puede llamar webhooks. Solo lee + escribe el output que esperamos. Esto convierte un agente potencialmente peligroso en una función pura desde la perspectiva del consumidor.

### 4. El merger no es un agente

Y eso es **feature**, no bug. Lo determinístico es donde está la garantía de comportamiento. Si el merger fuera otro LLM, no podríamos prometer que la misma entrada produce el mismo PR comment.

### 5. Prompt opinionado, no configurable

Los consumidores **no pueden cambiar el prompt** desde su workflow. Tienen que fork si quieren otra cosa. Razón: si cada repo arma su propio prompt, la métrica `agreement_score` deja de ser interpretable entre repos, y el "Action SDD canónico" deja de ser canónico.

---

## Alternativas consideradas (y por qué no las tomamos)

| Opción | Harness | Por qué la descartamos (por ahora) |
|---|---|---|
| Claude vía API directa (sin claude-code-action) | Nuestro código con Anthropic SDK | Perderíamos integración nativa con GH PRs, retries, observability, model auto-selection. Más código propio a mantener. |
| Cursor agent | Cursor IDE | No tiene modo headless para CI. |
| Aider | Python CLI | Posible pero implica reescribir el stack a Python. Aider está más optimizado para edits, no para review puro. |
| Self-hosted Llama via Ollama | Nuestro propio harness | Todo código nuestro, modelo no validado para review adversarial de RFCs técnicos largos. |
| GitHub Copilot Workspaces | GitHub | No expone API para reviews automatizados todavía. |
| Un solo agente, dos prompts distintos | Mismo crítico, dos roles | Ensemble del mismo modelo — `agreement_score` pierde poder discriminativo. |

**Conclusión:** Claude + Codex con sus harnesses oficiales es el sweet spot de:
- **Menos código propio** (un wrapper de invocación + el prompt + el merger)
- **LLMs validados** para razonamiento técnico
- **Integración nativa** con GitHub Actions y PR comments
- **Dos perspectivas independientes** que dan señal de confianza (`agreement_score`)

---

## Para profundizar

- Spec arquitectónico: [`docs/superpowers/specs/2026-05-27-sdd-review-action-design.md`](https://github.com/ittidigital/tech-emergentes-eval-runner) (vive en el worktree de research, no en este repo).
- Rationale del prompt: [`docs/PROMPT.md`](./PROMPT.md).
- Cómo iterar localmente: [`docs/DEVELOPMENT.md`](./DEVELOPMENT.md).
- Docs oficiales del harness Claude: https://github.com/anthropics/claude-code-action
- Docs oficiales del Codex CLI: https://github.com/openai/codex
