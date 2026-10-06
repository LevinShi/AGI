# Third-party notices

Quota Desk original code is licensed under MIT; see LICENSE. Product names and trademarks belong to their respective owners. This project has no official endorsement from the referenced projects or AI providers.

## Bundled runtime

The macOS release includes Node.js. Its complete license file, including embedded third-party notices, is shipped as `Quota Desk.app/Contents/Resources/NODE-LICENSE.txt`. Those licenses continue to apply independently of Quota Desk's MIT license. The release build uses the build machine's Node version; release metadata records its version and architecture. Source exports do not embed Node binaries.

Node.js: https://github.com/nodejs/node
License: https://github.com/nodejs/node/blob/main/LICENSE

Full upstream license texts are retained in `LICENSES/` (inside the App resources in binary releases) for reference and preservation of upstream notices.

## Design and protocol references

These are references and external interoperability targets, not bundled copies of the upstream applications. Quota Desk's UI and provider modules are implemented in this repository. If future contributions copy upstream code, preserve the corresponding copyright and license notices with that code.

- Token Monitor: https://github.com/Javis603/token-monitor — interface and information organization reference. MIT: https://github.com/Javis603/token-monitor/blob/main/LICENSE
- OpenQuota: https://github.com/deviffyy/OpenQuota — desktop interaction and ordering reference. MIT: https://github.com/deviffyy/OpenQuota/blob/main/LICENSE
- CodexBar: https://github.com/steipete/CodexBar — provider architecture, quota concepts and external JSON compatibility reference. MIT: https://github.com/steipete/CodexBar/blob/main/LICENSE
- MiniMax Code: https://github.com/MiniMax-AI/minimax-code — official authentication service protocol reference; separately installed by users. MIT: https://github.com/MiniMax-AI/minimax-code/blob/main/LICENSE
- Kimi CLI: https://github.com/MoonshotAI/kimi-cli — official CLI and usage schema reference; separately installed by users. Apache-2.0: https://github.com/MoonshotAI/kimi-cli/blob/main/LICENSE

Swift/AppKit/WebKit and other system libraries are supplied by macOS and are not redistributed here. Vendor clients, Codex CLI and Tabbit/its CLI are not included in the distribution. Their licenses and service terms remain independent.
