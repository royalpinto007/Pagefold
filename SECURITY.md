# Security Policy

## Supported versions

The latest release is supported. Pagefold is a browser extension, so the
version that matters is the one installed from the store.

## Reporting a vulnerability

Please do not open a public issue, discussion or pull request for a security
problem.

Report it privately through GitHub's
[security advisory form](https://github.com/royalpinto007/Pagefold/security/advisories/new),
which is visible only to the maintainers.

Include what you found, how to reproduce it, and what an attacker could do with
it. A rough proof of concept helps.

You can expect an acknowledgement within a week. If the report is valid, we
will agree a disclosure timeline with you before anything is made public.

## Scope

Pagefold reads pages you ask it to save and stores the text locally. The things
most worth reporting:

- **Anything that gets script execution in the extension's context.** Saved
  articles come from arbitrary pages, so their text is untrusted input. It is
  rendered with `textContent` and never as markup; a way around that is the
  highest severity issue here.
- **Anything that reads a page the user did not ask to save.** The extractor is
  injected on demand into a single tab and should never run otherwise.
- **Any network request the extension makes.** There should be none at all, so
  one appearing is a finding in itself.
- **Anything that lets a crafted backup file corrupt or escape the archive on
  import.**
