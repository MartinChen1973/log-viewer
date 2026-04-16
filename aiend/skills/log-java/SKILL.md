# Log analysis — Java / Spring / JVM

## When to use

Stack traces, `ERROR`/`WARN` from Java services, Spring Boot banners, GC or thread dumps.

## Checklist

1. Root exceptions and caused-by chains; first failure vs cascade.
2. Framework hints (Spring, Hibernate, Tomcat) and configuration mistakes.
3. Memory or thread issues (OutOfMemoryError, deadlock, pool exhaustion).
4. Startup vs runtime failures; bean / context errors.
5. Repeated lines vs one-off — indicate stability impact.

## Output

Sections: Summary, Root cause candidates, Evidence (with line themes), Operational next steps.
