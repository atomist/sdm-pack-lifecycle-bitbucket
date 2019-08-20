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
    isGenerated,
    LifecycleActionPreferences,
    RendererContext,
    SlackActionContributor,
} from "@atomist/sdm-pack-lifecycle";
import { Action } from "@atomist/slack-messages";
import * as _ from "lodash";

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

        if (context.rendererId === "status") {
            const mergeButtons = this.mergePRActions(pr, repo);

            const commits = pr.commits.filter(c => !!c.statuses && c.statuses.length > 0)
                .sort((c1, c2) => (c2.timestamp || "0").localeCompare(c1.timestamp));
            if (commits.length > 0) {
                const commit = commits[0];
                if (!commit.statuses.some(s => s.state !== "success")) {
                    buttons.push(...mergeButtons);
                }
            } else {
                buttons.push(...mergeButtons);
            }
        }
        return Promise.resolve(buttons);
    }

    public menusFor(pr: graphql.PullRequestToPullRequestLifecycle.PullRequest, context: RendererContext):
        Promise<Action[]> {
        return Promise.resolve([]);
    }

    private mergePRActions(pr: graphql.PullRequestToPullRequestLifecycle.PullRequest,
                           repo: graphql.PullRequestFields.Repo): Action[] {
        const buttons: Action[] = [];
        const mergeMethods: any = {
            merge: undefined,
            squash: undefined,
            rebase: undefined,
        };
        const title = `Merge pull request #${pr.number} from ${pr.repo.owner}/${pr.repo.name}`;
        const message = pr.title;
        if (repo.allowMergeCommit === true) {
            mergeMethods.merge = {
                method: "Merge",
                title,
                message,
            };
        }
        if (repo.allowSquashMerge === true && !isGenerated(pr)) {
            mergeMethods.squash = {
                method: "Squash and Merge",
                title: `${pr.head.message} (#${pr.number})`,
                message: `${pr.title}\n\n${pr.commits.map(c => `* ${c.message}`).join("\n")}`,
            };
        }
        if (repo.allowRebaseMerge === true && !isGenerated(pr)) {
            mergeMethods.rebase = {
                method: "Rebase and Merge",
                title,
                message,
            };
        }
        if (!repo.allowMergeCommit
            && !repo.allowSquashMerge
            && !repo.allowRebaseMerge) {
            mergeMethods.merge = {
                method: "Merge",
                title,
                message,
            };
        }

        _.forIn(mergeMethods, (v, k) => {
            if (v) {
                buttons.push(buttonForCommand(
                    { text: v.method, role: "global" },
                    "MergeGitHubPullRequest",
                    {
                        issue: pr.number,
                        repo: repo.name,
                        owner: repo.owner,
                        title: v.title,
                        message: v.message,
                        mergeMethod: k,
                        sha: pr.head.sha,
                    }));
            }
        });

        return buttons;
    }

}
