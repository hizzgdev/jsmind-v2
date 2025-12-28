# Git 多 Push URL 配置与 Pre-Push Hook 最佳实践

## 前言

在实际开发中，我们有时需要将代码同时推送到多个远程仓库，例如同时推送到 GitHub 和 Gitee。Git 支持为同一个 remote 配置多个 `pushurl`，但这也带来了一个问题：当配置了多个 push URL 时，`pre-push` hook 会被多次调用，如何合理编写 hook 脚本来避免重复执行检查，同时确保检查失败时能阻止所有推送操作？本文将从配置方法到脚本实现，详细介绍这一场景下的最佳实践。

## 配置多个 Push URL

### 方法一：使用 `git remote set-url --add --push`

这是最常用的方法，可以为同一个 remote 添加多个 push URL。

```bash
# 查看当前 remote 配置
git remote -v

# 添加第一个 push URL（如果还没有设置）
git remote set-url origin <第一个仓库地址>

# 添加第二个 push URL
git remote set-url --add --push origin <第二个仓库地址>

# 如果需要添加更多，继续执行
git remote set-url --add --push origin <第三个仓库地址>
```

**示例：**
```bash
# 设置 GitHub 作为 fetch URL
git remote set-url origin git@github.com:username/repo.git

# 添加 Gitee 作为 push URL
git remote set-url --add --push origin git@gitee.com:username/repo.git

# 添加 GitHub 作为 push URL（这样两个仓库都会收到推送）
git remote set-url --add --push origin git@github.com:username/repo.git
```

### 方法二：直接编辑 `.git/config` 文件

也可以直接编辑 Git 配置文件：

```bash
# 编辑配置文件
git config --edit
```

或者直接编辑 `.git/config` 文件，添加多个 `pushurl`：

```ini
[remote "origin"]
    url = git@github.com:username/repo.git
    fetch = +refs/heads/*:refs/remotes/origin/*
    pushurl = git@github.com:username/repo.git
    pushurl = git@gitee.com:username/repo.git
```

### 验证配置

配置完成后，可以使用以下命令验证：

```bash
# 查看 remote 配置
git remote -v

# 查看详细配置
git config --get-regexp remote\.origin\.(url|pushurl)
```

## Pre-Push Hook 的执行机制

### 多 Push URL 下的执行特点

当配置了多个 push URL 时，执行 `git push` 时：

1. **Hook 会被多次调用**：Git 会为每个 push URL 分别调用一次 `pre-push` hook
2. **参数传递方式**：
   - **命令行参数**：`$1` 是 remote 名称（如 `origin`），`$2` 是当前 push URL
   - **标准输入（stdin）**：每行格式为 `<local_ref> <local_sha> <remote_ref> <remote_sha>`
3. **执行顺序**：按照配置的 push URL 顺序依次执行

### 官方文档说明

根据 [Git 官方文档](https://git-scm.com/docs/githooks#_pre_push)，`pre-push` hook 接收：

- **命令行参数**：`<remote> <url>`（两个参数）
- **标准输入**：每行格式为 `<local-ref> SP <local-object-name> SP <remote-ref> SP <remote-object-name> LF`

**重要提示**：`local_sha`（本地提交的 SHA）需要通过读取标准输入获取，而不是从命令行参数中获取。

### 删除分支时的特殊情况

当执行删除分支操作时（`git push origin :{branch_name}` 或 `git push origin --delete {branch_name}`），`pre-push` hook 仍然会被执行，但参数格式有所不同：

- **`<local-ref>`**：为 `(delete)` 字符串
- **`<local-object-name>`**：为全零的 SHA（`0000000000000000000000000000000000000000`）
- **`<remote-ref>`**：要删除的远程分支引用
- **`<remote-object-name>`**：远程分支的最新提交 SHA

因此，在编写 `pre-push` hook 时，需要处理删除分支的情况。如果不需要对删除操作进行检查，可以在脚本开头添加判断：

```bash
# 检查是否是删除操作
if [ "$local_ref" = "(delete)" ] || [ "$local_sha" = "0000000000000000000000000000000000000000" ]; then
    echo "Skipping pre-push checks for branch deletion..."
    exit 0
fi
```

## Pre-Push Hook 脚本设计要点

### 核心问题

在多 push URL 场景下，编写 `pre-push` hook 需要解决以下问题：

1. **避免重复执行检查**：同一个 commit 推送到多个仓库时，不应该重复执行相同的检查
2. **确保失败时阻止所有推送**：如果检查失败，应该阻止所有后续的 push URL 推送
3. **状态持久化**：需要将检查结果保存下来，供后续的 hook 调用使用

### 解决方案：基于 Commit SHA 的状态文件

核心思路是使用 commit SHA 作为唯一标识，将检查结果保存到状态文件中：

1. **状态文件命名**：`logs/pre-push/check-status-{commit_sha}`
2. **状态文件格式**：
   - 包含所有检查命令的详细输出
   - 文件末尾包含成功标志：`PRE_PUSH_SUCCESS`
3. **执行逻辑**：
   - 如果状态文件存在且包含成功标志 → 直接通过
   - 如果状态文件存在但没有成功标志 → 阻止推送（说明上次检查失败）
   - 如果状态文件不存在 → 执行检查并保存结果

### 完整脚本示例

以下是基于上述思路实现的完整 `pre-push` hook 脚本：

```bash
#!/bin/sh

# Git pre-push hook receives:
# - Command line args: <remote> <url>
# - stdin: lines of <local_ref> <local_sha> <remote_ref> <remote_sha>
# Read the first line from stdin to get local_sha
read local_ref local_sha remote_ref remote_sha

# If no input (shouldn't happen, but handle gracefully)
if [ -z "$local_sha" ]; then
    echo "❌ Error: Could not determine commit SHA from push operation"
    exit 1
fi

# Generate a unique status file based on the commit SHA being pushed
STATUS_FILE="logs/pre-push/check-status-${local_sha}"

# Create logs directory if it doesn't exist
mkdir -p logs/pre-push

# Check if status file exists
if [ -f "$STATUS_FILE" ]; then
    # Status file exists, check if it contains success flag
    if grep -q "^PRE_PUSH_SUCCESS$" "$STATUS_FILE"; then
        echo "✅ Pre-push checks already passed for commit ${local_sha}"
        echo "📄 Check detailed output in: $STATUS_FILE"
        exit 0
    else
        # Status file exists but no PRE_PUSH_SUCCESS flag, means previous check failed
        echo "❌ Pre-push checks failed for commit ${local_sha}"
        echo "📄 Check detailed output in: $STATUS_FILE"
        exit 1
    fi
fi

# Status file doesn't exist, run all checks
echo "[pre-push] Running checks for commit ${local_sha}..."

# Run format-check
echo "[pre-push] Running format-check..."
npm run format-check > "$STATUS_FILE" 2>&1
if [ $? -ne 0 ]; then
    echo "❌ format-check failed. Check detailed output in: $STATUS_FILE"
    exit 1
fi

# Run type-check
echo "[pre-push] Running type-check..."
npm run type-check >> "$STATUS_FILE" 2>&1
if [ $? -ne 0 ]; then
    echo "❌ type-check failed. Check detailed output in: $STATUS_FILE"
    exit 1
fi

# Run test
echo "[pre-push] Running test..."
npm run test >> "$STATUS_FILE" 2>&1
if [ $? -ne 0 ]; then
    echo "❌ test failed. Check detailed output in: $STATUS_FILE"
    exit 1
fi

# All checks passed, add success flag to status file
{
    echo "---"
    echo "PRE_PUSH_SUCCESS"
} >> "$STATUS_FILE"

echo "✅ All pre-push checks passed!"
echo "📄 Check detailed output in: $STATUS_FILE"
exit 0
```

### 脚本关键点解析

#### 1. 从标准输入读取 Commit SHA

```bash
read local_ref local_sha remote_ref remote_sha
```

这是获取 commit SHA 的正确方式。Git 通过标准输入传递推送信息，而不是通过命令行参数。

#### 2. 状态文件的作用

- **第一次 push URL 调用**：状态文件不存在，执行检查并保存结果
- **后续 push URL 调用**：状态文件已存在，直接读取结果，避免重复检查
- **检查失败时**：状态文件保存错误信息，后续所有 push URL 都会读取到失败状态并阻止推送

#### 3. 短路执行

如果某个检查失败，直接 `exit 1`，不会继续执行后续检查，节省时间。

#### 4. 状态文件位置

状态文件保存在 `logs/pre-push/` 目录下，建议将此目录添加到 `.gitignore`：

```
logs/pre-push/
```

这样状态文件不会被提交到仓库。

### 工作流程示例

假设配置了两个 push URL（GitHub 和 Gitee），执行 `git push`：

1. **第一次调用**（推送到 GitHub）：
   - 状态文件不存在
   - 执行 `format-check`、`type-check`、`test`
   - 如果全部通过，保存结果并添加 `PRE_PUSH_SUCCESS` 标志
   - 如果失败，保存错误信息并退出

2. **第二次调用**（推送到 Gitee）：
   - 状态文件已存在
   - 检查文件末尾是否有 `PRE_PUSH_SUCCESS` 标志
   - 如果有，直接通过（跳过重复检查）
   - 如果没有，阻止推送（说明上次检查失败）

## 最佳实践总结

1. **使用 Commit SHA 作为状态文件标识**：确保每个 commit 有独立的状态跟踪
2. **状态文件包含完整输出**：便于调试和查看详细错误信息
3. **成功标志放在文件末尾**：使用 `grep` 检查时更高效
4. **失败时直接退出**：不保存状态文件或保存失败状态，确保后续 push URL 都能读取到失败状态
5. **提示用户查看状态文件**：无论是成功还是失败，都提示用户可以在状态文件中查看详细信息

## 常见问题

### Q: 如果修复了问题后再次推送，会使用旧的状态文件吗？

A: 不会。每次新的 commit 都有不同的 SHA，因此会使用新的状态文件。只有推送同一个 commit 时才会复用状态文件。

### Q: 状态文件会占用很多空间吗？

A: 状态文件通常只有几 KB 到几十 KB，而且每个 commit 只有一个文件。如果担心空间，可以定期清理旧的状态文件。

### Q: 可以只对特定的 push URL 执行检查吗？

A: 可以。在脚本开头检查 `$2`（push URL）参数，只对特定 URL 执行检查。但这样会导致其他 push URL 跳过检查，可能不符合预期。

### Q: 删除分支时 pre-push hook 会被执行吗？

A: 是的。执行 `git push origin :{branch_name}` 或 `git push origin --delete {branch_name}` 删除分支时，`pre-push` hook 仍然会被触发。此时：
- `local_ref` 为 `(delete)`
- `local_sha` 为全零的 SHA（`0000000000000000000000000000000000000000`）

如果不需要对删除操作进行检查，可以在脚本开头添加判断并直接跳过。

## 参考资源

- [Git Hooks 官方文档](https://git-scm.com/docs/githooks)
- [Git Remote 配置文档](https://git-scm.com/docs/git-remote)

