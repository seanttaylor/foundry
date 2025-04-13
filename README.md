# foundry

Foundry is a CLI application that consumes an OpenAPI specification and generates a functional server as output. This application parses an OpenAPI document to extract relevant information such as paths, operations, request/response schemas, and validation rules. From these, Foundry generates the necessary server-side components including route handlers, data models and stubbed logic for each endpoint, all based on the specification's structure and examples.

## **The Problem**

Generating server stubs from OpenAPI specs should be fast, flexible, and maintainable—but existing tools often fall short. Many solutions produce outdated, rigid, or overly opinionated code, making customization a hassle. Developers face limitations in enforcing team conventions, extending generated logic, or integrating custom middleware without manual tweaks. If you've struggled with tools like SmartBear's API Hub, where generated code feels restrictive or stale, you know the pain.

## **The Solution: Foundry**

Foundry is a terminal-based tool that transforms OpenAPI specs into fully functional Express servers—with **your** conventions, **your** extensions, and **zero** outdated templates. Unlike other generators, Foundry:

- **Stays in Sync** – Always generates code that matches the latest OpenAPI spec..
- **Extends Easily** – Supports OpenAPI extensions (`x-*`) to inject custom logic, middleware, or helpers directly into the generated code.

## **How It Works**

1. **Feed it a Spec** – Point Foundry at your OpenAPI YAML/JSON file.
2. **Generate & Go** – It outputs a demo server with models, validation, and example-based stubs.
3. **Customize Freely** – Extend or modify the output without fighting the generator.

## **Why It’s Better**

Foundry avoids the "one-size-fits-none" approach. Instead of locking you into a rigid structure, it gives you:

- **Clean, Idiomatic Code** – No bloated boilerplate.
- **Validation Built-In** – Request validation checks from the spec are auto-enforced
- **Mocking When Needed** – Realistic stubs from examples, ready for testing.

## **Get Started**

Run it locally, plug it into your CI/CD, or use it as a mock server—Foundry adapts to your workflow. No SaaS, no outdated templates, just your spec turned into code. Fast.

```sh
npx foundry build --path ./api.yaml --output ./server --lang javascript
```

Build better APIs, faster. **Foundry makes the spec the source of truth—not an afterthought.**
