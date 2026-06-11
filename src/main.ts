import * as core from '@actions/core'
import * as github from '@actions/github'
import minimatch from 'minimatch'

type Format = 'space-delimited' | 'csv' | 'json'
type FileStatus = 'added' | 'modified' | 'removed' | 'renamed'
type Octokit = ReturnType<typeof github.getOctokit>
type CompareCommitsResponse = Awaited<ReturnType<Octokit['rest']['repos']['compareCommits']>>
type CompareCommitsFile = NonNullable<CompareCommitsResponse['data']['files']>[number]

async function run(): Promise<void> {
  try {
    const token = core.getInput('token', {required: true})
    const client = github.getOctokit(token)
    const {context} = github
    const format = core.getInput('format', {required: true}) as Format
    const filter = core.getMultilineInput('filter', {required: true}) || ['*']

    if (format !== 'space-delimited' && format !== 'csv' && format !== 'json') {
      core.setFailed(`Format must be one of 'space-delimited', 'csv', or 'json', got '${format}'.`)
      return
    }

    core.debug(`Payload keys: ${Object.keys(context.payload)}`)

    const eventName = context.eventName
    let base: string | undefined
    let head: string | undefined

    switch (eventName) {
      case 'pull_request_target':
      case 'pull_request':
        base = context.payload.pull_request?.base?.sha
        head = context.payload.pull_request?.head?.sha
        break
      case 'merge_group':
        base = context.payload.merge_group?.base_sha
        head = context.payload.merge_group?.head_sha
        break
      case 'push':
        base = context.payload.before
        head = context.payload.after
        break
      default:
        core.setFailed(
          `This action only supports pull requests and pushes, ${context.eventName} events are not supported. ` +
            "Please submit an issue on this action's GitHub repo if you believe this in correct."
        )
        return
    }

    core.info(`Base commit: ${base}`)
    core.info(`Head commit: ${head}`)

    if (!base || !head) {
      core.setFailed(
        `The base and head commits are missing from the payload for this ${context.eventName} event. ` +
          "Please submit an issue on this action's GitHub repo."
      )
      return
    }

    const response = await client.rest.repos.compareCommits({
      base,
      head,
      owner: context.repo.owner,
      repo: context.repo.repo
    })

    if (response.status !== 200) {
      core.setFailed(
        `The GitHub API for comparing the base and head commits for this ${context.eventName} event returned ${response.status}, expected 200. ` +
          "Please submit an issue on this action's GitHub repo."
      )
      return
    }

    if (!response.data.files) {
      core.setFailed(
        `The GitHub API for comparing the base and head commits for this ${context.eventName} event returned no files. ` +
          "Please submit an issue on this action's GitHub repo."
      )
      return
    }

    const files = response.data.files.filter((file: CompareCommitsFile) => {
      let match = false
      for (const item of filter) {
        const pattern = item
        core.debug(`Test ${file.filename} against ${pattern}`)
        core.debug(`current match value: ${match}`)
        if (pattern.startsWith('!')) {
          match = match && minimatch(file.filename, pattern, {matchBase: true, dot: true})
        } else {
          match = match || minimatch(file.filename, pattern, {matchBase: true, dot: true})
        }
        core.debug(`match: ${match}`)
      }
      return match
    })

    const all: string[] = [],
      added: string[] = [],
      modified: string[] = [],
      removed: string[] = [],
      renamed: string[] = [],
      addedModified: string[] = [],
      addedModifiedRenamed: string[] = []
    for (const file of files) {
      const filename = file.filename
      if (format === 'space-delimited' && filename.includes(' ')) {
        core.setFailed(
          `One of your files includes a space. Consider using a different output format or removing spaces from your filenames. ` +
            "Please submit an issue on this action's GitHub repo."
        )
      }
      all.push(filename)
      switch (file.status as FileStatus) {
        case 'added':
          added.push(filename)
          addedModified.push(filename)
          addedModifiedRenamed.push(filename)
          break
        case 'modified':
          modified.push(filename)
          addedModified.push(filename)
          addedModifiedRenamed.push(filename)
          break
        case 'removed':
          removed.push(filename)
          break
        case 'renamed':
          renamed.push(filename)
          addedModifiedRenamed.push(filename)
          if (file.patch) {
            modified.push(filename)
            addedModified.push(filename)
          }
          break
        default:
          core.setFailed(
            `One of your files includes an unsupported file status '${file.status}', expected 'added', 'modified', 'removed', or 'renamed'.`
          )
      }
    }

    let allFormatted: string,
      addedFormatted: string,
      modifiedFormatted: string,
      removedFormatted: string,
      renamedFormatted: string,
      addedModifiedFormatted: string,
      addedModifiedRenamedFormatted: string
    switch (format) {
      case 'space-delimited':
        for (const file of all) {
          if (file.includes(' '))
            core.setFailed(
              `One of your files includes a space. Consider using a different output format or removing spaces from your filenames.`
            )
        }
        allFormatted = all.join(' ')
        addedFormatted = added.join(' ')
        modifiedFormatted = modified.join(' ')
        removedFormatted = removed.join(' ')
        renamedFormatted = renamed.join(' ')
        addedModifiedFormatted = addedModified.join(' ')
        addedModifiedRenamedFormatted = addedModifiedRenamed.join(' ')
        break
      case 'csv':
        allFormatted = all.join(',')
        addedFormatted = added.join(',')
        modifiedFormatted = modified.join(',')
        removedFormatted = removed.join(',')
        renamedFormatted = renamed.join(',')
        addedModifiedFormatted = addedModified.join(',')
        addedModifiedRenamedFormatted = addedModifiedRenamed.join(',')
        break
      case 'json':
        allFormatted = JSON.stringify(all)
        addedFormatted = JSON.stringify(added)
        modifiedFormatted = JSON.stringify(modified)
        removedFormatted = JSON.stringify(removed)
        renamedFormatted = JSON.stringify(renamed)
        addedModifiedFormatted = JSON.stringify(addedModified)
        addedModifiedRenamedFormatted = JSON.stringify(addedModifiedRenamed)
        break
    }

    core.info(`All: ${allFormatted}`)
    core.info(`Added: ${addedFormatted}`)
    core.info(`Modified: ${modifiedFormatted}`)
    core.info(`Removed: ${removedFormatted}`)
    core.info(`Renamed: ${renamedFormatted}`)
    core.info(`Added or modified: ${addedModifiedFormatted}`)
    core.info(`Added, modified or renamed: ${addedModifiedRenamedFormatted}`)

    core.setOutput('all', allFormatted)
    core.setOutput('added', addedFormatted)
    core.setOutput('modified', modifiedFormatted)
    core.setOutput('removed', removedFormatted)
    core.setOutput('renamed', renamedFormatted)
    core.setOutput('added_modified', addedModifiedFormatted)
    core.setOutput('added_modified_renamed', addedModifiedRenamedFormatted)

    // For backwards-compatibility
    core.setOutput('deleted', removedFormatted)
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error))
  }
}

run()
