# Cómo funciona · explicación para equipos técnicos

> **Audiencia:** ingenieros, arquitectos, PMs técnicos que van a usar o consumir `sdd-review-action` y quieren entender qué pasa por debajo sin tener que leer el código.
>
> **Tiempo de lectura:** 15-20 min.
>
> **Cuándo leer cada doc:**
> - **Empezá acá** para entender el sistema desde primeros principios.
> - [`AGENTES-Y-HARNESS.md`](./AGENTES-Y-HARNESS.md) para la arquitectura técnica detallada.
> - [`PROMPT.md`](./PROMPT.md) para entender por qué el prompt está escrito así.
> - [`DEVELOPMENT.md`](./DEVELOPMENT.md) para iterar localmente.

---

## 1. El problema · ¿por qué automatizar la revisión de RFCs?

Cuando un equipo trabaja con el framework **SDD (Solution Design & Decision)**, cada feature nuevo genera un **RFC** — un documento técnico de 30-80 páginas que describe la arquitectura, las decisiones tomadas, los ADRs, los flujos de datos, los NFRs, etc.

Revisar un RFC bien hecho cuesta **60-120 minutos de un ingeniero senior**. Y aún así, los humanos somos malos para:
- Detectar contradicciones entre la sección 3 y la sección 8 (cansancio cognitivo).
- Verificar que cada decisión tenga rationale, alternativas y tradeoffs.
- Chequear que los IDs de ADRs estén bien numerados.
- Cruzar lo que dice el PRD con lo que responde el RFC.
- Resistir el sesgo de validación ("se ve razonable, dale").

La hipótesis: **un agente LLM con instrucciones adversariales sistemáticas puede hacer este tipo de revisión mejor (y por orden de magnitud más barato) que un humano cansado**. El humano sigue siendo el dueño de la decisión final — el agente solo le entrega un reporte priorizado para que decida.

---

## 2. De LLM a agente · qué cambia

Hay una distinción importante que mucha gente mezcla:

| | LLM (modelo) | Agente |
|---|---|---|
| Qué es | Una función que predice tokens dado un prompt | Un LLM + un **loop** + **herramientas** |
| Ejemplo | "ChatGPT te responde una pregunta" | "Claude Code lee archivos, edita código, corre tests, y vuelve a iterar" |
| Capacidad | One-shot, sin memoria | Multi-step, puede explorar, equivocarse y corregir |
| Costo conceptual | Una llamada API | N llamadas API encadenadas según necesidad |

**Un LLM por sí solo no puede revisar un RFC complejo** porque:
- No puede leer archivos del disco
- No puede navegar entre secciones del documento
- No puede consultar archivos relacionados (ADRs, PRD)
- No puede escribir su output a un archivo estructurado

**Lo que convierte un LLM en agente es su harness** — el código que le da herramientas, le permite usarlas en loop, y captura su output. Sin harness, un LLM es solo un autocompletado glorificado.

---

## 3. El harness · la pieza invisible que hace la magia

Pensá en el harness como **el entorno controlado** donde vive el agente. Define:
- **Qué tools puede usar** (leer archivos, escribir, ejecutar comandos)
- **Cuándo termina el loop** (cuando el LLM dice "listo" o cuando se alcanza un límite)
- **Cómo se invoca** (CLI, GitHub Action, API)
- **Qué hace si algo falla** (retries, timeouts)
- **Qué seguridad aplica** (sandbox, permisos, secrets)

Para nuestro Action usamos **dos harnesses oficiales** — uno por cada agente que corre:

### Harness de Claude · `claude-code-action@v1`

- **Quién lo mantiene:** Anthropic (mismo equipo que el modelo)
- **Cómo lo usamos:** GitHub Action oficial, lo invocamos con `uses: anthropics/claude-code-action@v1`
- **Loop interno:** el clásico de Claude Code — pensar → tool call → leer resultado → repetir → escribir output → terminar
- **Tools que le permitimos:** `Read`, `Write`, `Bash(cat:*)`, `Bash(ls:*)`. Nada más.
- **Tools que NO le permitimos:** `Edit` (no queremos que modifique el RFC), `Bash(*)` libre (no debe ejecutar scripts del repo)

### Harness de Codex · `@openai/codex` CLI v0.134

- **Quién lo mantiene:** OpenAI (mismo equipo que el modelo GPT-5)
- **Cómo lo usamos:** instalamos el binario en el runner de GitHub Actions y lo invocamos con `codex exec`
- **Loop interno:** similar al de Claude, pero la implementación es propietaria de OpenAI
- **Tools del sandbox:** read-only por default (el agente puede leer archivos pero no escribir ni ejecutar)
- **Auth:** requiere `codex login --with-api-key` antes de invocar (lección aprendida — ver `LESSONS.md`)

### Lo que tienen en común

Ambos harnesses son **caja negra** desde nuestro punto de vista: les damos un prompt + un set de tools, ellos ejecutan su loop interno, devuelven texto. No controlamos cómo razonan ni cuántas iteraciones internas hacen.

### Por qué no inventamos un harness propio

Algunos equipos quieren construir su propio agent framework (LangChain, LlamaIndex, etc.). Para nuestro caso de uso lo descartamos porque:
- Anthropic y OpenAI invierten **millones** en optimizar sus harnesses
- Cada vez que Claude o Codex tienen una mejora, **la recibimos gratis** sin tocar nuestro código
- Mantener un harness propio significa debuggear loops infinitos, manejar timeouts, etc. — distracción del valor real

**Lo que SÍ inventamos** es el prompt opinionado, el merger determinístico, y el oráculo de testing.

---

## 4. La estrategia adversarial · por qué no decimos "revisá esto"

Si le pedís a un LLM **"revisá este RFC y decime qué te parece"**, te va a contestar:

> "El RFC se ve bien estructurado, las decisiones están bien fundamentadas. Hay algunos puntos de mejora menores..."

Esa respuesta **es basura**. El LLM está optimizado para complacer (RLHF reinforcement) y por default elogia. Para el caso de uso de revisión, el sesgo de validación es un bug — no queremos que valide, queremos que **rompa**.

La solución es el **framing adversarial**. En el prompt le decimos:

> "Sos un revisor adversarial. Tu trabajo es encontrar problemas, no elogiar. Sé escéptico. Rechazá vaguedad. Asumí que el autor está tratando de pasarte gato por liebre. Buscá contradicciones internas. Demandá evidencia para cada claim."

Esto cambia radicalmente la salida. El mismo modelo, con el mismo input, devuelve hallazgos concretos en vez de elogios genéricos.

**Validamos esto en un experimento previo:** revisamos un RFC de producción de un cliente real (`uenoadswow`). El review humano tradicional había aprobado el RFC. La revisión adversarial encontró **7 contradicciones reales** que habían pasado desapercibidas (entre ellas: un swap de IDs ADR-003 vs ADR-005, contradicciones de schema entre secciones, secciones duplicadas).

---

## 5. Dos críticos en paralelo · ¿por qué no uno solo?

Si Claude solo ya encuentra problemas reales, **¿para qué pagamos también Codex?**

La razón es **diversidad de sesgos**. Aunque ambos son LLMs grandes con capacidades parecidas, fueron entrenados con datos distintos, arquitecturas distintas y técnicas de fine-tuning distintas. Eso hace que **vean cosas distintas**:

- Claude tiende a ser más fuerte detectando ambigüedad de lenguaje y rationale faltante.
- Codex tiende a ser más fuerte detectando contradicciones técnicas estructurales (schemas, signatures, flows).

### La métrica clave · `agreement_score`

Después de que ambos críticos entregan su reporte, calculamos:

```
agreement_score = findings_donde_ambos_coinciden / total_findings
```

Tres rangos a interpretar:

| Rango | Lectura |
|---|---|
| **80-100%** | Los dos críticos ven lo mismo. Alta confianza en el reporte. Probablemente uno solo bastaría → posible drop de un crítico en V2. |
| **40-70%** | Los dos aportan perspectivas distintas. **Sweet spot del híbrido** — esto es lo que justifica pagar los dos. |
| **<30%** | Uno o ambos están perdidos. Revisar prompt o rúbrica. No es señal confiable. |

### Cómo se rinde esto en el comment del PR

El reporte que aparece en el PR tiene 3 secciones:

```
✅ Coincidencias (alta confianza)    ← lo que ambos vieron · atender primero
⚠️ Solo Claude                       ← lo que solo Claude vio · taste decision
⚠️ Solo Codex                        ← lo que solo Codex vio · taste decision
```

El humano decide a qué nivel del reporte le da bola. Las coincidencias son casi siempre verdaderos positivos. Los "solo X" pueden ser falsos positivos o pueden ser hallazgos legítimos que el otro crítico no priorizó.

---

## 6. La rúbrica · el contrato entre el framework y la revisión

El framework SDD tiene una lista de cosas que un RFC **debe cumplir** para considerarse listo:

- Cada decisión debe tener rationale
- Cada decisión debe mencionar alternativas consideradas
- Cada NFR debe tener target cuantitativo (no "rápido", sino "p95 ≤ 200ms")
- Los IDs de ADRs deben ser secuenciales
- Las acceptance criteria del PRD deben tener respuesta arquitectónica
- No puede haber TBDs colgados
- ... y unas 30 más

Esa lista vive en un archivo YAML que el repo SDD versionea: `criteria/eval-criteria.yaml`. Cada entrada se ve así:

```yaml
- id: rfc-no-vague-language
  severity: P2
  check: "RFC must not use 'rápido', 'escalable', 'robusto' without numeric targets"
```

**El crítico LLM no inventa las reglas — las recibe.** El prompt le dice "lee la rúbrica y aplicá cada assertion al RFC". Esto significa:
- El framework controla qué se evalúa (governance)
- El LLM solo aplica las reglas (execution)
- Si querés cambiar qué se evalúa, editás el YAML — no tocás el Action

Cuando el crítico devuelve un finding, **debe citar el `id` de la assertion** que se violó. Así el merger puede mezclar coincidencias y el humano puede trazar cada hallazgo a una regla concreta.

---

## 7. El merger NO es un agente · y por qué eso es clave

Después de que Claude y Codex devuelven sus dos JSONs, **un código TypeScript determinístico** los combina. Esa pieza no usa LLM. Es funciones puras: mapas, filtros, ordenamientos, render de markdown.

**Por qué importa que el merger NO sea agente:**

| Si fuera agente | Como es función pura (lo que elegimos) |
|---|---|
| Costo por review = costo de 3 LLM calls | Costo = costo de 2 LLM calls (el merger es gratis) |
| Output cambia entre runs (no-determinismo) | Misma entrada → siempre misma salida |
| No se puede testear sin pagar | 12 unit tests corren en 9 milisegundos sin gastar tokens |
| Black box opaca para debugging | Cada línea es legible y debugueable |
| Suma un punto de fallo (otro modelo que puede colgarse) | Robustez del compilador TypeScript |

**Regla de oro de diseño:**

> Cualquier cosa que pueda hacerse sin LLM, **NO debe hacerse con LLM**.

Pasar lógica determinística por un LLM es desperdiciar dinero, tiempo y predictibilidad. Reservá los agentes para lo único que solo ellos pueden hacer: **interpretar lenguaje natural y aplicar juicio sobre documentos**.

---

## 8. Ejemplo concreto · paso a paso

Imaginate este RFC de prueba (`tests/fixtures/sample-rfc.md` en el repo del Action):

```markdown
# RFC · Payment Gateway Module

## 2.1 Datastore
Decisión: usar PostgreSQL. ADR-001.

## 2.2 Protocol
Decisión: REST sobre HTTPS. ADR-005.

## 2.3 Schema
transactions: id, amount, currency, status, created_at

## 3. Flow
1. Cliente envía POST /charge
2. Backend valida
3. Insertamos en transactions con status=processed y customer_id

## 4. Performance
El sistema será rápido y escalable.

## 4. Security
Usamos HTTPS y validamos input.

## 5. Open questions
(none)
```

¿Cuántos problemas notás vos? Hay **6 defectos plantados**. Te los listo y mirás cómo el agente los detecta:

### Defecto 1 · Schema vs Flow contradictorios

En §3 el flow inserta `customer_id`, pero `customer_id` **no aparece en el schema** de §2.3.

Lo que devuelve Codex:
```json
{
  "priority": "P1",
  "assertion_id": "rfc-schema-consistent-with-flow",
  "title": "Add 'customer_id' to schema to match flow",
  "evidence": "§3 Validation flow step 3: 'Insertamos en transactions con status=processed y el customer_id.' vs §2.3 Schema: fields listed do not include customer_id.",
  "suggested_fix": "In §2.3 Schema, add customer_id UUID NOT NULL with FK to customers(id) and index; in §3 step 3, enumerate all persisted fields to keep flow and schema aligned."
}
```

**Notá:**
- Cita literal del texto que violó la regla
- Fix concreto, no "agregar más detalle"
- Cita el `assertion_id` de la rúbrica (`rfc-schema-consistent-with-flow`)

### Defecto 2 · IDs de ADR no secuenciales

§2.1 cita ADR-001. §2.2 cita ADR-005. Falta ADR-002 a ADR-004. Probablemente uno de los dos IDs está mal.

```json
{
  "priority": "P1",
  "assertion_id": "rfc-adr-id-consistent",
  "title": "Make ADR IDs sequential within RFC",
  "evidence": "§2.1: 'ADR-001'. §2.2: 'ADR-005'.",
  "suggested_fix": "Renumber 'ADR-005' to 'ADR-002' or include ADR-002..ADR-004 entries if relevant; add an ADR Index section."
}
```

### Defecto 3 · Lenguaje vago sin números

§4 Performance dice "rápido y escalable". Cero números.

```json
{
  "priority": "P2",
  "assertion_id": "rfc-no-vague-language",
  "title": "Replace vague perf claims with numeric targets",
  "evidence": "§4 Performance: 'El sistema será rápido y escalable.'",
  "suggested_fix": "Replace with: 'p95 latency for POST /charge ≤ 200ms at 500 RPS; sustained throughput ≥ 30 TPS'."
}
```

### Defecto 4 · Numeración duplicada

Hay dos secciones con `## 4` (Performance y Security).

```json
{
  "priority": "P2",
  "assertion_id": "rfc-section-numbering-unique",
  "title": "Fix duplicate '§4' numbering for Security",
  "evidence": "Headings: '## 4. Performance' and later '## 4. Security'",
  "suggested_fix": "Renumber '## 4. Security' to '## 5. Security' and shift '## 5. Open questions' to '## 6. Open questions'."
}
```

(Sigue con 2 defectos más — los puede ver completo en el artifact del último smoke run.)

### Qué ve el humano al final

Un comment en el PR como:

```markdown
## 🔍 SDD Review · RFC adversarial

| Métrica | Valor |
|---|---:|
| Total findings | 9 |
| 🔴 P1 (críticos) | 2 |
| 🟡 P2 (gaps) | 5 |
| 🟢 P3 (mejoras) | 2 |
| 🤝 Agreement score | 78% (7/9 coinciden)

### ✅ Coincidencias — alta confianza (7)
[... los 7 findings que ambos detectaron ...]

### ⚠️ Solo Claude (1)
[... 1 finding solo de Claude ...]

### ⚠️ Solo Codex (1)
[... 1 finding solo de Codex ...]
```

El humano lee, decide cuáles atender, edita el RFC, pushea de nuevo, y el Action corre otra review.

---

## 9. Cómo sabemos que el sistema funciona · el oracle

Esta es la parte más sutil. Si confiás en un agente LLM, **¿cómo verificás que no está alucinando?**

La respuesta: **un oracle**. Un test que sabe la respuesta correcta de antemano.

En nuestro caso:
1. **Plantamos defectos a propósito** en el RFC de prueba (los 6 que listamos arriba)
2. **Listamos cuáles son los 5 más importantes** en `expected-findings.json`
3. **Cada vez que cambiamos algo** del Action (prompt, modelo, harness), corremos el smoke contra el fixture
4. **El test exige** que los 5 must-find aparezcan en el output. Si falta uno, el smoke falla y bloquea el release.

```json
{
  "must_find": [
    { "assertion_id": "rfc-schema-consistent-with-flow", "priority": "P1" },
    { "assertion_id": "rfc-adr-id-consistent",           "priority": "P1" },
    { "assertion_id": "rfc-section-numbering-unique",    "priority": "P2" },
    { "assertion_id": "rfc-no-vague-language",           "priority": "P2" },
    { "assertion_id": "rfc-perf-has-targets",            "priority": "P2" }
  ],
  "tolerable_extras": true
}
```

`tolerable_extras: true` significa: **el critic puede encontrar MÁS de 5 (eso es bonus), pero no puede encontrar menos.**

Esto es lo que permite iterar el prompt o cambiar el modelo con confianza. Si un cambio rompe la detección, el smoke nos avisa antes de promoverlo a producción.

---

## 10. Lo que NO resuelve (todavía)

Para que el alcance del MVP quede claro:

| Cosa | Por qué no | Cuándo se piensa |
|---|---|---|
| **Auto-fix del RFC** | El loop adversarial con auto-corrección no convergió en el experimento. Encontramos que necesita contexto multi-archivo (PRD, ADRs, drivers) para reparar bien | V3 — auto-fix asistido donde el humano elige qué findings aplicar |
| **Review multi-artefacto** | El MVP solo lee el RFC. No correlaciona con PRD o ADRs externos. 8/15 findings residuales del experimento eran cross-artifact | V2 — el Action lee un bundle |
| **Memoria entre PRs** | Cada review es fresh. No aprende de findings que el humano dismisseó en PRs anteriores | V4 — requiere persistencia y políticas de aprendizaje |
| **Block del merge** | Por default el Action solo comenta, no bloquea. Activable con `fail_on_p1: true` cuando el accept rate sea alto | Decisión del consumidor cuando confíe en los hallazgos |
| **Reviewar código (no doc)** | Es un revisor de RFCs. Para código, usar `claude-code-action` directo o tools como Greptile, Codeball, etc. | Distinto producto |

---

## 11. Glosario rápido

| Término | Qué es |
|---|---|
| **RFC** | Request For Comments. El documento técnico que diseña una feature en el framework SDD. |
| **ADR** | Architecture Decision Record. Documento corto que captura una decisión arquitectónica con su rationale, alternativas y consecuencias. |
| **SDD** | Solution Design & Decision. El framework de way-of-work que el equipo usa para diseñar antes de implementar. |
| **Adversarial reviewer** | Un crítico instruido a buscar problemas, no a validar. Contrario al RLHF default. |
| **Harness** | El código que envuelve un LLM y lo convierte en agente (tools, loop, I/O). |
| **Agente** | LLM + harness. Puede ejecutar tareas multi-step usando herramientas. |
| **Rubric / rúbrica** | Lista de assertions (reglas) que el crítico aplica al RFC. Versionada por repo. |
| **Oracle** | Test que sabe la respuesta correcta de antemano. Usamos un RFC de prueba con defectos plantados. |
| **agreement_score** | % de findings donde Claude y Codex coinciden. Métrica de confianza del reporte. |
| **must_find** | Los findings que el oracle obliga a detectar. Si falta uno, el smoke falla. |
| **tolerable_extras** | Findings adicionales más allá del must_find. Permitidos porque los LLMs no son determinísticos. |

---

## 12. Próximo paso recomendado · ver una review en vivo

Si querés ver el sistema funcionando contra un RFC real, lo más rápido es:

1. Abrir el comment de [este PR draft (TBD si decidimos hacer self-review)](https://github.com/ittidigital/sdd-review-action/pulls)
2. Revisar la sección "Coincidencias" del comment auto-generado
3. Comparar con el RFC original para ver si los hallazgos tienen sentido

Para integrarlo en tu propio repo SDD:

```yaml
# .github/workflows/sdd-review.yml en tu repo
name: SDD review
on:
  pull_request:
    paths: ['arch/RFC.md']

jobs:
  review:
    uses: ittidigital/sdd-review-action/.github/workflows/review-rfc.yml@v1
    with:
      rfc_path: arch/RFC.md
      criteria_path: criteria/eval-criteria.yaml
    secrets:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      OPENAI_API_KEY:    ${{ secrets.OPENAI_API_KEY }}
```

20 líneas de YAML. Eso es todo lo que necesitás del lado consumidor.

---

## Preguntas frecuentes anticipadas

**¿Reemplaza a un revisor humano?**
No. Reemplaza la parte mecánica (chequear que la rúbrica se cumpla). El humano sigue tomando decisiones de arquitectura, juzgando tradeoffs y dando el "OK final".

**¿Qué pasa si Claude y Codex se ponen de acuerdo en un finding falso?**
Posible pero raro. Las coincidencias en findings ad-hoc (sin assertion_id de la rúbrica) son donde más cuidado hay que tener. El humano final filtra esos.

**¿Cuánto cuesta una review?**
~$0.30-0.50 USD por revisión completa con ambos críticos a reasoning=medium. Comparado con $50-100 de un revisor humano por una hora, el ROI es claro.

**¿Funciona en otros idiomas?**
El RFC puede estar en español, inglés o mezclado. El prompt está en inglés (los LLMs razonan mejor en inglés). La rúbrica YAML puede tener checks en cualquier idioma. Probado en español hasta ahora.

**¿Se puede correr local sin GitHub?**
Sí — ver [DEVELOPMENT.md](./DEVELOPMENT.md). Necesitás `OPENAI_API_KEY` y/o `ANTHROPIC_API_KEY` exportados, Bun instalado, codex CLI instalado.

**¿Por qué los críticos a veces fallan?**
Razones documentadas en `LESSONS.md` del repo de research: cambios en CLIs, modelos no disponibles en tu cuenta, sandbox issues. Cuando falla un crítico, el merger sigue con el otro y reporta `critic unavailable` en el comment.
