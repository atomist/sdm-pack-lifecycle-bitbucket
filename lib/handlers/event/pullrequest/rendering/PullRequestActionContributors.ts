/*
 * Copyright © 2019 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    buttonForCommand,
} from "@atomist/automation-client";
import {
    AbstractIdentifiableContribution,
    graphql,
    LifecycleActionPreferences,
    RendererContext,
    SlackActionContributor,
} from "@atomist/sdm-pack-lifecycle";
import { Action } from "@atomist/slack-messages";

export class MergeActionContributor extends AbstractIdentifiableContribution
    implements SlackActionContributor<graphql.PullRequestToPullRequestLifecycle.PullRequest> {

    constructor() {
        super(LifecycleActionPreferences.pull_request.merge.id);
    }

    public supports(node: any): boolean {
        if (node.baseBranchName) {
            const pr = node as graphql.PullRequestToPullRequestLifecycle.PullRequest;
            return pr.state === "open" && (!pr.reviews || !pr.reviews.some(r => r.state !== "approved"));
        } else {
            return false;
        }
    }

    public buttonsFor(pr: graphql.PullRequestToPullRequestLifecycle.PullRequest, context: RendererContext):
        Promise<Action[]> {
        const repo = context.lifecycle.extract("repo");
        const buttons: Action[] = [];

        const button = buttonForCommand(
            { text: "Merge", role: "global" },
            "MergeBitbucketPullRequest",
            {
                org: repo.owner,
                owner: repo.owner,
                pr: pr.number,
                repo: repo.name,
                title: `Merge pull request #${pr.number} from ${pr.repo.owner}/${pr.repo.name}`,
                message: `Merge pull request #${pr.number} from ${pr.repo.owner}/${pr.repo.name}`,
                sha: pr.head.sha,
            });

        if (context.rendererId === "status") {
            const commits = pr.commits.filter(c => !!c.statuses && c.statuses.length > 0)
                .sort((c1, c2) => (c2.timestamp || "0").localeCompare(c1.timestamp));
            if (commits.length > 0) {
                const commit = commits[0];
                if (!commit.statuses.some(s => s.state !== "success")) {
                    buttons.push(button);
                }
            } else {
                buttons.push(button);
            }
        }
        return Promise.resolve(buttons);
    }

    public menusFor(pr: graphql.PullRequestToPullRequestLifecycle.PullRequest, context: RendererContext):
        Promise<Action[]> {
        return Promise.resolve([]);
    }
}

export class DeleteActionContributor extends AbstractIdentifiableContribution
    implements SlackActionContributor<graphql.PullRequestToPullRequestLifecycle.PullRequest> {

    constructor() {
        super(LifecycleActionPreferences.pull_request.delete.id);
    }

    public supports(node: any): boolean {
        if (node.baseBranchName) {
            const pr = node as graphql.PullRequestToPullRequestLifecycle.PullRequest;
            return pr.state === "closed"
                && !!pr.branch
                && pr.branch.name !== (pr.repo.defaultBranch || "master");
        } else {
            return false;
        }
    }

    public buttonsFor(pr: graphql.PullRequestToPullRequestLifecycle.PullRequest, context: RendererContext):
        Promise<Action[]> {
        const repo = context.lifecycle.extract("repo");
        const buttons = [];

        if (context.rendererId === "pull_request") {
            buttons.push(buttonForCommand({text: "Delete Branch", role: "global"}, "DeleteBitbucketBranch",
                {branch: pr.branch.name, repo: repo.name, owner: repo.owner}));
        }

        return Promise.resolve(buttons);
    }

    public menusFor(pr: graphql.PullRequestToPullRequestLifecycle.PullRequest, context: RendererContext):
        Promise<Action[]> {
        return Promise.resolve([]);
    }
}
