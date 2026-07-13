#!/usr/bin/env bash
# ─────────────────────────────────────────────
# sync.sh — 编译并同步插件到 Obsidian 测试仓库
#
# 用法:
#   bash sync.sh            # 编译 + 同步
#   bash sync.sh --dev      # 同步开发版（含 sourcemap，不压缩）
#   bash sync.sh --check    # 仅编译检查，不复制
# ─────────────────────────────────────────────

set -euo pipefail

# ─── 路径配置 ───
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
VAULT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/test-vault"
PLUGIN_ID="atomic-notes-extractor"
PLUGIN_DEST="$VAULT_DIR/.obsidian/plugins/$PLUGIN_ID"

# ─── 颜色 ───
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# ─── 前置检查 ───
[ -f "$PROJECT_DIR/package.json" ] || error "找不到 package.json，请在项目根目录运行"
[ -f "$PROJECT_DIR/esbuild.config.mjs" ] || error "找不到 esbuild.config.mjs"
[ -d "$VAULT_DIR" ] || error "找不到测试仓库: $VAULT_DIR"

# ─── 参数解析 ───
MODE="production"
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --dev)    MODE="dev" ;;
    --check)  DRY_RUN=true ;;
    --help|-h)
      echo "用法: bash sync.sh [--dev] [--check]"
      echo "  --dev    同步开发版（含 sourcemap，不压缩）"
      echo "  --check  仅编译检查，不复制文件"
      exit 0
      ;;
    *) error "未知参数: $arg（使用 --help 查看帮助）" ;;
  esac
done

# ─── 编译 ───
echo ""
echo "  编译模式: $MODE"
echo ""

cd "$PROJECT_DIR"

# dev 与 production 统一复用 esbuild.config.mjs 的 external 列表，
# 避免 sync.sh 与 esbuild.config.mjs 维护两份重复的 @codemirror external。
if [ "$MODE" = "production" ]; then
  node esbuild.config.mjs production 2>&1 || error "编译失败"
else
  node esbuild.config.mjs dev 2>&1 || error "编译失败"
fi

info "编译成功"

# ─── 编译检查模式：到此结束 ───
if [ "$DRY_RUN" = true ]; then
  BUILD_SIZE=$(wc -c < main.js | tr -d ' ')
  info "编译检查通过 (main.js: ${BUILD_SIZE} bytes)"
  exit 0
fi

# ─── 确保目标目录存在 ───
if [ ! -d "$PLUGIN_DEST" ]; then
  mkdir -p "$PLUGIN_DEST"
  info "已创建插件目录: $PLUGIN_DEST"
fi

# 必需文件（缺失则警告并跳过）
SYNCED=0
SKIPPED=0

# 必需文件
for file in main.js manifest.json styles.css; do
  if [ -f "$PROJECT_DIR/$file" ]; then
    cp "$PROJECT_DIR/$file" "$PLUGIN_DEST/$file"
    SYNCED=$((SYNCED + 1))
  else
    warn "跳过 $file（文件不存在）"
    SKIPPED=$((SKIPPED + 1))
  fi
done

# 可选元数据文件（README/CHANGELOG/package.json/LICENSE），缺失则静默跳过
for file in README.md CHANGELOG.md package.json LICENSE; do
  if [ -f "$PROJECT_DIR/$file" ]; then
    cp "$PROJECT_DIR/$file" "$PLUGIN_DEST/$file"
    SYNCED=$((SYNCED + 1))
  fi
done

# 不同步 data.json（保留用户配置）

# ─── 结果 ───
echo ""
BUILD_SIZE=$(wc -c < "$PLUGIN_DEST/main.js" | tr -d ' ')

if [ "$MODE" = "dev" ]; then
  info "开发版已同步到测试仓库 (${BUILD_SIZE} bytes, 含 sourcemap)"
else
  info "正式版已同步到测试仓库 (${BUILD_SIZE} bytes)"
fi

echo "  目标: $PLUGIN_DEST"
echo "  文件: ${SYNCED} 个已同步, ${SKIPPED} 个跳过"
echo ""
echo "  提示: 重新打开 Obsidian 或在设置中重启插件以加载新版本"
echo ""
