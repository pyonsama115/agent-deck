# 複数 PC のセッションをまとめるには

調査日: 2026-10-18。結論は「技術的に可能。ただし現在の実装はこの PC の収集のみ」。ネットワーク設定の変更や公開は実施していない。

## 別 PC からこの画面を見る

Tailscale Serve を使うと、localhost のサービスを tailnet 内に HTTPS で共有できる。Agent Deck は引き続き 127.0.0.1 に bind する。これは閲覧する場所を増やす仕組みであり、閲覧元 PC の Claude / Codex セッションは自動収集されない。ダッシュボードにはプロンプト断片、作業パス、タイムラインも含まれるため、共有対象を自分の端末に限定する設定が必要。

公式資料: [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve)、[Serve CLI](https://tailscale.com/docs/reference/tailscale-cli/serve)、[Serve examples](https://tailscale.com/docs/reference/examples/serve)。Serve は tailnet 内向け。公開インターネット向けの Funnel を使う必要はない。

## 複数 PC で動くセッションを一画面へ集約する

現在 server.js の collectClaude / collectCodex はローカルの .claude / .codex、Claude Desktop メタデータ、ローカル hooks を読む。GET /api/state と /events はその PC の snapshot を配信する。リモート収集先や hostId はない。そのため、各 PC に収集用 Agent Deck を起動し、中央で snapshot を統合する層を追加するのが自然。

実装する場合の要件:

- 永続 UUID の hostId を各端末に発行する。統合キーは hostId + provider + sessionId。表示名や IP を識別キーにしない。
- 端末ごとに認証・アクセス許可を持つ。read-only snapshot 取得から始め、hook 投稿や dismiss を共有しない。ネットワーク経由の timeline / dismiss は origin host に明示的にルーティングする。
- 受信時刻と端末の観測時刻を別々に保存する。一定時間無通信になった端末は offline、セッションは最終観測として表示する。通信切断を作業完了へ変換しない。再接続は snapshot の置換と重複排除で復元する。
- リモートは任意の URL を UI から直接 fetch させず、許可済み接続先のみをサーバー側で読む。タイムアウト、応答サイズ、JSON schema、部分故障を検証する。
- 初期共有は provider、状態、時刻、集計、短い表示名だけにする。プロンプト、本文、絶対パス、タイムラインは端末ごとの明示的な共有設定にする。API キーやアクセストークンは送らない。
- 使用枠は端末単位で足さない。Claude / Codex の同一アカウントの枠は複数端末で共有されうるため、accountId または明示的なアカウント設定で同一枠を一度だけ表示する。アカウント不明なら別観測として示し、総残量を計算しない。
- 週間・月間の作業時間は、セッション時間の合計と壁時計上の共同作業時間を分ける。同時稼働を二重計上しない。端末時計ずれや監視停止の欠測も示す。

## Claude / Codex の現在の測定上の違い

Claude のサブエージェント active は transcript の更新時刻が直近 30 秒かで推定される。完了状態を確定した人数ではない。Codex は現在 subagents が null で、spawn 系ツールの履歴は得られるが、稼働中の正確な人数は取得していない。画面や分析では未取得を 0 にせず、推定と欠測を区別する。

実装優先順は (1) 各端末のローカル監視を維持、(2) 認証付き read-only 接続と host 表示、(3) offline / 再接続 / 同一 ID 衝突テスト、(4) 集計と timeline、(5) 必要ならリモート操作。現段階は調査提案で、集約機能は未実装。
