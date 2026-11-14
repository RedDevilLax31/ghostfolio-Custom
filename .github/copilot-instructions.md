# GitHub Copilot Custom Instructions

## 1. Ambiguity & Clarification

- Never assume requirements if a prompt or code context is ambiguous, vague, or incomplete.
- Explicitly stop and ask clarifying questions before writing or modifying code when architectural, logic, or edge-case uncertainties exist.
- If multiple implementations are possible, present the trade-offs and wait for user confirmation.

## 2. Proactive Suggestions & Optimization

- Critically evaluate the requested approach. If a cleaner, more performant, more secure, or more idiomatic way to solve the problem exists, propose it.
- When suggesting an alternative approach, provide a brief, high-level rationale (e.g., better time complexity, reduced memory footprint, or alignment with industry best practices).
- Prioritize modern language features, robust error handling, and type safety where applicable.

## 3. Code Style & Standards

- Keep code clean, modular, and easy to maintain.
- Favor clarity and readability over overly clever or compressed code.

## 4. Development Environment

- When asked to start, launch, run, or prepare the local development environment, use the `start-dev-environment` skill.
- Use [DEVELOPMENT.md](../DEVELOPMENT.md) for setup details not covered by the skill.
