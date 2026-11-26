# Fixtures

`manifest-dbt-<version>.json`: what `dbt parse` of that dbt version wrote for the
[jaffle_shop_duckdb](https://github.com/dbt-labs/jaffle_shop_duckdb) example project (Apache-2.0, dbt Labs),
cut down to the fields tome-etl reads. The 1.12 one has two models more (`customer_payment_methods`,
`daily_revenue`), written with tome-etl's `scaffold`.
