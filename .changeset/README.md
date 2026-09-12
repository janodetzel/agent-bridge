# Changesets

Each file in this folder describes one change to a published package: which
packages it touches, whether it is a patch, minor or major bump, and a line for the
changelog. Add one with `pnpm changeset` in the pull request that makes the change.

On `main`, the publish workflow collects them into a "Version Packages" pull request
that bumps the versions and writes the changelogs. Merging that pull request
publishes the packages. See "Releasing" in the root README.
