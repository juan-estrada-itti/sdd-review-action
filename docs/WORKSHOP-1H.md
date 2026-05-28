# Workshop · 1 hora · adopción de `sdd-review-action`

> **Audiencia:** equipo técnico (4–12 personas) que va a empezar a usar `sdd-review-action` en sus repos SDD.
>
> **Objetivo:** que al terminar la hora **cada participante haya visto el sistema funcionando**, entienda el modelo mental, y tenga un PR draft en su propio repo con la Action wireada.
>
> **Metodología:** mezcla de [Stanford d.school Crash Course](https://www.innovationtraining.org/virtual-design-thinking-workshop-from-stanford-d-school/) (estructura comprimida + activities cronometradas), [Karpathy CS231n / Zero-to-Hero](https://karpathy.ai/zero-to-hero.html) (primeros principios + worked examples + hands-on, "no abstraer"), y [peer instruction](https://en.wikipedia.org/wiki/Peer_instruction) (checkpoints rápidos en pares).

---

## Principios de diseño del workshop (lo que justifica las decisiones)

| Principio | De dónde viene | Cómo se aplica acá |
|---|---|---|
| **Empezá con el dolor, no con la solución** | d.school "Empathize" | Primeros 5 min son el pain real del equipo (RFCs sin revisar, contradicciones que llegaron a prod), no slides de features |
| **Primeros principios, no abstracciones** | Karpathy | Construimos "LLM → agente → harness → revisor adversarial" paso a paso. Nada de "es como X pero Y" |
| **Worked example antes de la práctica** | Karpathy + CS pedagogy | Demo en vivo contra el fixture **antes** de que toquen sus propios repos |
| **Hands-on > más explicación** | d.school + Karpathy | 1/3 del tiempo es que toquen el código ellos. Si no tocan, no aprenden |
| **Peer instruction en checkpoints** | Eric Mazur | Cada 15 min hay un "díganle a su par X" — verifica comprensión sin lecture extra |
| **Salir con artifact tangible** | d.school prototype | Cada participante sale con un PR draft real en su repo |

---

## Pre-work (enviar 24h antes del workshop)

Email/Slack al equipo:

> **Para mañana al workshop traé:**
> 1. Tu laptop con acceso a GitHub (cuenta `ittidigital`)
> 2. Un repo SDD donde tengas write access (idealmente uno con RFC en `arch/RFC.md` real, aunque sea un draft)
> 3. **Una API key personal de Anthropic** (https://console.anthropic.com/ · ~$5 crédito alcanza) **o** confirmá que vas a usar solo la `OPENAI_API_KEY` corporativa
> 4. Lectura previa opcional (15 min): [docs/COMO-FUNCIONA.md](./COMO-FUNCIONA.md) — si la leíste, sacále más jugo al workshop. Si no, igual te llevamos al ritmo.
>
> **Lo que NO necesitás:** experiencia previa con GitHub Actions, ni con LLM APIs.

---

## Materiales que el facilitador prepara

1. **Pantalla compartida** con terminal + browser en split
2. **Repo sandbox demo**: un fork público o repo dummy con `arch/RFC.md` con defectos plantados a mano para usar de live demo
3. **Slack channel del workshop** (efímero) para que vayan pegando link a sus PRs
4. **Un printout** (sí, papel) de los 3 diagramas clave (ver §4 abajo)
5. **Timer visible** (Google clock proyectado o `pomodoro-cli`) — el cronometraje es parte de la metodología

---

## Agenda minuto a minuto

### 🎯 0:00 – 0:05 · Hook · "El RFC que nadie vio"

**Actividad:** facilitador presenta UN ejemplo real (anonimizado si hace falta) de un RFC que se aprobó humano y después en producción reveló un bug que el RFC ya contenía pero nadie detectó.

**Script sugerido:**
> "Esto es un PR de hace 2 meses. Lo revisaron tres ingenieros senior. Lo aprobaron. Después en prod nos dimos cuenta que el schema y el flow no coincidían. Tres pares de ojos lo perdieron. Hoy te voy a mostrar un sistema que en 3 minutos lo hubiera detectado."

**Por qué este formato:** [d.school empathize](https://dschool.stanford.edu/resources/dschool-starter-kit) — el contenido se ancla mejor cuando empieza con un dolor reconocido.

**NO hacer:** abrir con "Vamos a ver sdd-review-action, una GitHub Action para revisar RFCs". Eso es features, no need.

---

### 🧱 0:05 – 0:20 · Primeros principios · construir el modelo mental

**Formato:** mini-lectura interactiva con whiteboard / pantalla. 15 min. **3 ladrillos** que se construyen uno arriba del otro:

#### Ladrillo 1 (5 min) · ¿Qué es un agente vs un LLM?

Dibujar en vivo:

```
LLM solo:          [pregunta] ──▶ [LLM] ──▶ [respuesta]   ← one-shot

Agente:            [tarea] ──▶ [LLM] ──┬──▶ [tool: read file]
                                       ├──▶ [tool: write file]
                                       └──▶ [decide terminar]
                                              ↑       │
                                              └───────┘  loop
```

**Pregunta al grupo (peer check 30s):**
> "Si Claude.ai te resume un PDF, ¿es un LLM o un agente? Discutalo con tu vecino, 30 segundos."

**Respuesta esperada:** depende — si solo le pegás el texto y te contesta, es LLM. Si Claude Code abre el archivo, navega, hace búsqueda, es agente.

#### Ladrillo 2 (5 min) · ¿Qué es un harness?

El harness es el código que envuelve al LLM y le da:
- Tools (read, write, bash)
- Loop control
- Sandboxing
- Auth/secrets management

Dibujar:

```
┌──────────────────────────────────┐
│         HARNESS                  │
│  ┌──────────────────────────┐    │
│  │  agent loop control      │    │
│  │  ┌──────────────────┐    │    │
│  │  │     LLM          │    │    │
│  │  └──────────────────┘    │    │
│  │   tools allowlist        │    │
│  │   sandbox                │    │
│  │   I/O                    │    │
│  └──────────────────────────┘    │
└──────────────────────────────────┘
```

**Punto clave a martillar:** "Anthropic mantiene el harness de Claude. OpenAI mantiene el de Codex. Nosotros NO inventamos un harness — eso sería desperdiciar millones de dólares de R&D ajeno."

#### Ladrillo 3 (5 min) · ¿Por qué adversarial?

Demo rápida en pantalla. Le pedís a ChatGPT (o el LLM que sea) que revise un párrafo malo.

Prompt 1 (sin instrucción adversarial):
> "Revisá este RFC: [el sample-rfc.md de defectos plantados]"

LLM va a contestar: "Se ve bien estructurado, hay algunos puntos a mejorar..." 🤮

Prompt 2 (con instrucción adversarial):
> "Sos un revisor adversarial. Asumí que el autor está mintiendo. Encontrá problemas. No elogiés."

LLM mismo va a destrozar el documento ✅

**Lección:** el LLM tiene el conocimiento. El framing es lo que activa la utilidad.

---

### 🎬 0:20 – 0:35 · Worked example en vivo · demo

**Formato:** facilitador hace la corrida completa en pantalla. **No hay slides — es terminal + browser.**

#### Paso 1 (3 min) · Abrir el fixture

```bash
gh repo view ittidigital/sdd-review-action --web
# Navegar a tests/fixtures/sample-rfc.md
# Mostrar los 6 defectos plantados (los señalás con el cursor uno por uno)
```

**Pregunta al grupo (peer check 1 min):**
> "Sin contar lo que ya te dije: ¿cuántos defectos podés encontrar en 60 segundos de lectura?"

Después de 60s, contás manos. Típicamente la gente encuentra 2-3 de 6. Eso es el baseline.

#### Paso 2 (5 min) · Triggear el smoke en vivo

```bash
gh workflow run smoke-e2e.yml \
  --repo ittidigital/sdd-review-action \
  -f reasoning=medium \
  -f enable_claude=true \
  -f enable_codex=true

# Watch en otra pestaña
gh run watch <RUN_ID> --repo ittidigital/sdd-review-action
```

Mientras corre (~5 min), aprovechás para mostrar:
- El archivo `prompts/adversarial-rfc.md` — leés en voz alta las primeras 5 líneas para que vean qué tan literal es la instrucción
- El archivo `eval-criteria.yaml` con las 10 reglas
- El archivo `expected-findings.json` con los 5 must-find

**Pregunta al grupo (peer check 1 min):**
> "¿Por qué creés que `assertion_id` es un campo obligatorio en cada finding?"

**Respuesta esperada:** porque el merger lo usa para detectar coincidencias entre Claude y Codex.

#### Paso 3 (7 min) · Inspeccionar el output

Una vez que terminó:

```bash
mkdir -p /tmp/demo && cd /tmp/demo
gh run download <RUN_ID> --repo ittidigital/sdd-review-action
cat merged-report/merged-summary.json
cat merged-report/merged-report.md
```

Abrir el `.md` en VS Code (o similar). Recorrer:
- Tabla resumen
- Coincidencias (cuáles son los 5 must-find que detectaron)
- Solo Claude (qué vio Claude que Codex no)
- Solo Codex (qué vio Codex que Claude no)
- El campo `agreement_score` y qué significa

**Punto a martillar:** "El humano sigue siendo el dueño de la decisión. El reporte le dice DÓNDE mirar — no le dice qué hacer."

---

### 🔧 0:35 – 0:55 · Hands-on · vos lo wireá en tu repo

**Formato:** 20 minutos de trabajo individual + ayuda del facilitador. Cada participante:

1. Abre su repo SDD
2. Crea branch `feat/sdd-review-action-integration`
3. Crea archivo `.github/workflows/sdd-review.yml` con el siguiente contenido (template ya en clipboard, pegable):

   ```yaml
   name: SDD review
   on:
     pull_request:
       paths: ['arch/RFC.md']
     workflow_dispatch:

   jobs:
     review:
       uses: ittidigital/sdd-review-action/.github/workflows/review-rfc.yml@v1
       with:
         rfc_path: arch/RFC.md
         criteria_path: criteria/eval-criteria.yaml
         enable_claude: true   # poner false si solo usás Codex
         enable_codex: true
       secrets:
         ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
         OPENAI_API_KEY:    ${{ secrets.OPENAI_API_KEY }}
   ```

4. Setea los secrets que correspondan:
   ```bash
   gh secret set OPENAI_API_KEY --repo <tu-org>/<tu-repo>
   # opcionalmente
   gh secret set ANTHROPIC_API_KEY --repo <tu-org>/<tu-repo>
   ```

5. Verifica que `criteria/eval-criteria.yaml` exista en su repo. Si no, copia el del fixture como starter:
   ```bash
   curl https://raw.githubusercontent.com/ittidigital/sdd-review-action/main/tests/fixtures/eval-criteria.yaml \
     > criteria/eval-criteria.yaml
   git add criteria/eval-criteria.yaml
   ```

6. Hace una edit chica a `arch/RFC.md` (un typo cualquier cosa) para que el `pull_request` filter dispare:

   ```bash
   echo "" >> arch/RFC.md  # newline al final
   git add arch/RFC.md
   git commit -m "test: triggear sdd-review-action"
   ```

7. Push branch + abre PR:
   ```bash
   git push origin feat/sdd-review-action-integration
   gh pr create --title "test: integrar sdd-review-action" --body "Workshop $(date +%Y-%m-%d)"
   ```

8. **Pegá el link del PR en el Slack channel del workshop.**

**Rol del facilitador durante este bloque:**
- Camina entre los participantes (si es presencial) o vigila Slack (si es remoto)
- Resuelve el primer error de cada uno (permisos, paths, etc.)
- Cuando 2-3 personas tengan el mismo error, lo levanta al grupo entero
- Marca en el Slack channel qué PRs van llegando

**Tiempo restante visible:** facilitador anuncia "5 min restantes" cuando faltan 5.

---

### 🔁 0:55 – 1:00 · Reflexión + commits para el lunes

**Formato:** ronda rápida de 5 min. **NO es Q&A abierto** — es estructurado.

#### Round 1 (2 min) · Una cosa que NO entendiste

Cada participante en una frase. Facilitador anota en un doc compartido. No se contestan en el momento — se prometen para follow-up.

#### Round 2 (2 min) · Un commit para el lunes

Cada participante en una frase: "Para el lunes voy a [X]". Ejemplos:
- "Para el lunes voy a abrir el PR de prueba en mi repo principal"
- "Para el lunes voy a leer COMO-FUNCIONA.md completo"
- "Para el lunes voy a proponerle a mi tribu activarlo en el repo Y"

**Compromisos públicos** funcionan — la gente cumple lo que dijo en voz alta.

#### Cierre (1 min) · Próximos pasos

Facilitador anuncia:
1. Doc oficial: `docs/COMO-FUNCIONA.md` para profundizar
2. Issues del repo para feedback: https://github.com/ittidigital/sdd-review-action/issues
3. Slack channel se mantiene activo por una semana para dudas
4. Office hours opcional para quienes quieran que un mentor les revise su PR
5. Si querés profundizar arquitectura: `docs/AGENTES-Y-HARNESS.md`

---

## Anti-patterns · qué NO hacer

| Anti-pattern | Por qué |
|---|---|
| **Empezar con slides de features** | Mata la motivación. Empezá con el dolor (d.school). |
| **Mostrar el código fuente del Action** | Es distracción. Los participantes son consumidores, no contributors. |
| **Dejar el hands-on para el final como "tarea"** | El 80% no lo va a hacer. Forzá que sea EN el workshop. |
| **Explicar el merger en detalle** | No agrega valor al consumidor. Mencionalo en 1 frase. |
| **Q&A abierto largo al final** | Una persona se lleva 10 minutos, el resto se aburre. Round 1+2 estructurado funciona mejor. |
| **NO cronometrar** | Sin timer las secciones se desbordan y no llegás a hands-on. El cronómetro es disciplina, no opresión. |
| **Workshop sin pre-work** | Empezás con todo el grupo en distinto nivel base. El pre-work nivela. |
| **Facilitador habla >70% del tiempo** | Karpathy regla: el aprendizaje ocurre cuando el estudiante hace, no cuando escucha. |

---

## Métricas de éxito del workshop

Al terminar la hora, **mediblemente**:

| Métrica | Cómo se mide |
|---|---|
| **% de participantes con PR draft creado** | Contar links en Slack channel |
| **% que terminó con CI verde en el PR** | Más estricto — requiere secret seteado y workflow corrió |
| **NPS del workshop** | 1 pregunta post: "Recomendarías este workshop a un colega? 0-10" |
| **Conversión a uso real (7 días después)** | Cuántos abrieron un PR REAL (no de prueba) que disparó el Action |

Target realista para primera corrida:
- 70%+ con PR draft creado
- 50%+ con CI verde
- NPS 8+
- 30%+ de uso real a la semana

Si la conversión a uso real es <20%, el workshop falló su propósito. El éxito es **adopción**, no asistencia.

---

## Variantes según audiencia

### Si el equipo es 100% senior con LLMs

Skip Ladrillo 1 y 2 (los conocen). Expand Ladrillo 3 + worked example. Más tiempo en hands-on.

### Si el equipo nunca usó GitHub Actions

Agregá 5 min al inicio explicando qué es un workflow YAML, qué es un secret. Quitalo del hands-on. Quizá vale workshop separado de GHActions primero.

### Si son >12 personas

Romper en breakout rooms de 4 durante hands-on. Un mentor por breakout. Reducir hands-on a 15 min y agregar 5 min para report-out.

### Si es remoto (no presencial)

- Pre-work obligatoria (no opcional)
- Cámaras prendidas
- Slack channel siempre abierto
- Breakouts en Zoom (peer instruction sigue funcionando)
- Facilitador con co-facilitador para vigilar Slack mientras el principal habla

---

## Recursos para el facilitador

- [d.school Starter Kit](https://dschool.stanford.edu/tools/starter-kit) — el original del format crash course
- [Karpathy Neural Networks: Zero To Hero](https://karpathy.ai/zero-to-hero.html) — el reference de "first principles + hands-on"
- [Peer Instruction · Eric Mazur](https://mazur.harvard.edu/research-areas/peer-instruction) — la fundamentación científica del peer check
- Doc interno: [docs/COMO-FUNCIONA.md](./COMO-FUNCIONA.md) — lectura previa del facilitador

---

## Para iterar este workshop

Después de cada corrida, capturar en `LESSONS.md` del repo de research:
- Qué pregunta apareció ≥3 veces (señal de que el doc no la cubre bien)
- Qué bloqueo técnico apareció ≥3 veces (señal de que el setup tiene fricción)
- Qué quedó sin tiempo (señal de que hay que reordenar)

El workshop también es un producto — se itera con feedback de los usuarios.
