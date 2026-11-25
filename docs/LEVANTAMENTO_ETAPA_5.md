# Etapa 5 — Roteiro de levantamento (FRC, Giaffone, E-Kart, integrações e IA)

O PRD (§2, §12 item 5) define que a expansão para FRC, Giaffone e E-Kart e as integrações só começam **após levantamento específico**, e que IA é opcional e depende de governança aprovada. Este roteiro organiza esse levantamento. Nada aqui foi presumido: responda o que se aplica e marque “não sei / a confirmar” quando for o caso.

**Hoje, sem desenvolvimento adicional**, essas competições já podem ser cadastradas (Competições → Programas) e usar os módulos comuns: equipes com vigência, agenda, ações, checklists, documentos, recursos, orçamento, riscos, benchmarking e relatórios.

---

## A. Para cada competição (FRC, Giaffone, E-Kart)

Responda uma vez por competição.

### A1. Identificação
1. Unidade(s) envolvida(s) e ciclo/temporada (datas de início e fim).
2. Responsável na supervisão e orientadores previstos.
3. Etapas oficiais (regional, nacional, internacional) e datas confirmadas ou estimadas.
4. Regulamento oficial: link ou arquivo, versão e data.

### A2. Equipe
5. Formato: tamanho mínimo e máximo, papéis exigidos (ex.: capitão, piloto, mecânico, programador, mentor).
6. Requisitos de elegibilidade (idade, matrícula, vínculo).
7. Há suplentes? Como são substituídos?

### A3. Desempenho e avaliação
8. Como a equipe é avaliada? (pontuação de partidas, tempo de volta, prova técnica, relatório de engenharia, pitch, segurança…)
9. Quais **indicadores** a gestão quer acompanhar? Para cada um: fórmula, fonte, meta e periodicidade.
10. Há treinos ou simulações que devem ser registrados como os simulados do WorldSkills? Com que escala?
11. Existem metas de resultado (colocação, prêmios) para o ciclo?

### A4. Projeto técnico e construção
12. Há projeto do robô/veículo com fases (concepção, projeto, fabricação, testes, competição)? Quais **portões** de passagem e evidências exigidas?
13. Controle de peças/componentes: lista de materiais, custos, fornecedores, estoque, entregas?
14. Registro de **testes** (dados de telemetria, tempos, falhas, causa raiz)? Em que formato chegam hoje (planilha, software, papel)?
15. Inspeções técnicas e de **segurança** obrigatórias (checklists oficiais)? Pode enviar o modelo?

### A5. Logística e recursos
16. Viagens: transporte de equipamento, hospedagem, alimentação, autorização de menores?
17. Inscrições e taxas: valores, prazos, quem paga?
18. Patrocínios e parceiros: precisam ser acompanhados (contrapartidas, prazos)?
19. Ambientes e equipamentos específicos (pista, arena, oficina, impressoras 3D, bancada de bateria)?

### A6. Documentos e privacidade
20. Documentos obrigatórios (termos, autorizações, laudos, apólices)? Quais contêm dados pessoais sensíveis?
21. Prazos de guarda desses documentos.

---

## B. Integrações

Para cada integração desejada, informe **sistema, dono, finalidade, sentido dos dados (entra/sai), frequência e se há API oficial**.

1. **Calendário institucional** (Google, Microsoft 365): basta a exportação ICS atual ou é preciso sincronizar?
2. **E-mail/WhatsApp para alertas:** hoje os alertas são internos (PRD §9: sem envio externo no MVP). Deseja e-mail? Para quais alertas e para quem? Há SMTP institucional?
3. **Sistemas acadêmicos** (matrícula, frequência): importar alunos/turmas? Quem autoriza o acesso?
4. **Compras/financeiro:** só referência (número do processo) ou integração? Lembrete do PRD: aprovação no portal não substitui a autorização institucional.
5. **Planilhas existentes** (ex.: os modelos em `docs/gestao-estrategica`): importar uma vez, sincronizar periodicamente ou substituir pelo portal?
6. **Dashboards externos** (Power BI, Looker): exportação CSV atual é suficiente ou precisa de conexão direta (somente leitura)?
7. **Login institucional (SSO):** e-mail/senha atual ou login com conta Microsoft/Google institucional?

---

## C. IA (opcional — exige governança aprovada)

Responder só se houver interesse. Nada será implementado sem aprovação formal.

1. **Casos de uso desejados** (ex.: resumir fechamentos semanais, sugerir causa raiz a partir de erros de simulado, rascunhar relatório mensal, responder dúvidas sobre o regulamento).
2. **Dados permitidos:** quais módulos podem ser enviados a um modelo de IA? Dados de pessoas, notas e saúde/NAPI devem ficar **fora**?
3. **Fornecedor e hospedagem** aprovados pela instituição (contrato, região dos dados, retenção, uso para treinamento).
4. **Responsável pela governança** e como as respostas serão revisadas por humanos.
5. **Registro e auditoria:** o que precisa ficar registrado (quem pediu, o que foi enviado, resposta)?

---

## D. Prioridade e entrega

1. Ordem de prioridade entre FRC, Giaffone, E-Kart e as integrações.
2. Datas-limite (ex.: início de temporada).
3. Quem valida cada entrega.

> Ao concluir, envie as respostas (ou edite este arquivo). Com elas, o desenvolvimento da Etapa 5 seguirá o mesmo padrão das anteriores: plano, modelo de dados com permissões e testes, telas, SQL de atualização e relatório da etapa.
