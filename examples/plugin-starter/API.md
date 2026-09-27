---
schema: agents-company.cli/v1
plugin: workspace-notes
version: '1.0.0'
workspace: required
---
# Workspace Notes CLI/API

## Purpose

A dependency-free starter plugin. Copy this directory and replace its identity
and domain commands to build another CLI-first tool.

## Workspace

Pass `--workspace /absolute/folder`. The Team launcher supplies this automatically.
All filenames are relative to the root, independent of the employee's cwd.

## Quick start

```sh
workspace-notes api notes.list
workspace-notes api notes.write --data '{"name":"hello.md","content":"# Hello\n"}'
```

## Commands

See `schema.json`. `notes.list` returns filenames; `notes.write` accepts `name`
and `content` and returns the written filename. CLI and renderer invoke the same
runtime; results use JSON-RPC 2.0 envelopes.

## Files

This example writes only root-level Markdown files. Writing an existing filename
replaces its contents. It has no hidden metadata or background process.

## Errors

Unknown methods, invalid filenames and filesystem failures return `error`.
CLI failures exit with a nonzero status.

## Compatibility

Contract v1, Node 22+. There is no build step or external dependency. This package
is a developer example, installed only when requested with `agents plugin install`.
