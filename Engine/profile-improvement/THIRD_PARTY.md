# Third-party components

Engine source follows the repository's GPL-3.0 license. This Engine does not change third-party licensing or grant rights to user resumes.

| Component | Pinned version | License | Purpose |
| --- | --- | --- | --- |
| fflate | 0.8.3 | MIT | DOCX ZIP read/write |
| @xmldom/xmldom | 0.9.12 | MIT | Namespace-aware OOXML parsing |
| docx-preview | 0.4.1 | Apache-2.0 | Browser-only approximate Word preview |

Their original license/notice files remain in their npm packages and must accompany redistributed runtime bundles. Full transitive versions are pinned by this Engine's package-lock.json. No shared Infra implementation package is imported.

LibreOffice and Poppler are separately installed host tools, invoked only to render temporary synthetic/uploaded Word files and compare layout. They are not bundled or downloaded by the Engine. The final document retains original template fonts but no font file is redistributed.

Integration tests can install the official Pi program into a temporary test data directory via the public Infra installer, or accept `PROFILE_TEST_PI_BIN`. Its model traffic goes only to a local deterministic fixture server, never to a billed model provider. Pi runtime files are test artifacts outside this Engine and are not part of its source package.

Official references:
- https://github.com/101arrowz/fflate
- https://github.com/xmldom/xmldom
- https://github.com/VolodymyrBaydalka/docxjs
- https://help.libreoffice.org/latest/en-US/text/shared/guide/start_parameters.html
- https://github.com/earendil-works/pi-mono
