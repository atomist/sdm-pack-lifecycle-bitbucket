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
    logger,
    QueryNoCacheOptions,
} from "@atomist/automation-client";
import { ApolloGraphClient } from "@atomist/automation-client/lib/graph/ApolloGraphClient";
import {
    AbstractIdentifiableContribution,
    GoalSet,
    graphql,
    isFullRenderingEnabled,
    lastGoalSet,
    LifecycleActionPreferences,
    LifecycleConfiguration,
    LifecycleRendererPreferences,
    RendererContext,
    SlackActionContributor,
} from "@atomist/sdm-pack-lifecycle";
import { UpdateSdmGoalDisplayState } from "@atomist/sdm-pack-lifecycle/lib/handlers/command/sdm/UpdateSdmGoalDisplayState";
import { UpdateSdmGoalState } from "@atomist/sdm-pack-lifecycle/lib/handlers/command/sdm/UpdateSdmGoalState";
import {
    Action,
} from "@atomist/slack-messages";
import * as _ from "lodash";
import * as semver from "semver";
import {
    PushFields,
    SdmGoalDisplayFormat,
    SdmGoalDisplayState,
    SdmGoalState,
} from "../../../../typings/types";
import { CreateBitbucketTag } from "../../../command/bitbucket/CreateBitbucketTag";

const RepositoryTagsQuery = `query RepositoryTags($name: String!, $owner: String!) {
  repository(name: $name, owner: $owner) {
    refs(
      refPrefix: "refs/tags/"
      first: 1
      orderBy: { field: TAG_COMMIT_DATE, direction: DESC }
    ) {
      nodes {
        name
      }
    }
  }
}
`;

export class PullRequestActionContributor extends AbstractIdentifiableContribution
    implements SlackActionContributor<graphql.PushToPushLifecycle.Push> {

    constructor() {
        super(LifecycleActionPreferences.push.raise_pullrequest.id);
    }

    public supports(node: any): boolean {
        if (node.after) {
            const push = node as graphql.PushToPushLifecycle.Push;
            return push.branch !== (push.repo.defaultBranch || "master");
        } else {
            return false;
        }
    }

    public buttonsFor(node: graphql.PushToPushLifecycle.Push, ctx: RendererContext): Promise<Action[]> {
        if (ctx.rendererId === "commit") {
            const repo = ctx.lifecycle.extract("repo");

            return ctx.context.graphClient.query<graphql.Branch.Query, graphql.Branch.Variables>({
                name: "branch",
                variables: {
                    repo: repo.name,
                    owner: repo.owner,
                    branch: node.branch,
                },
                options: QueryNoCacheOptions,
            })
                .then(result => {
                    let showButton = true;
                    const buttons = [];

                    // If there are open PRs on the branch, don't show the button
                    const branch = _.get(result, "Repo[0].branches[0]");

                    // If there are PRs that already contain this push's after commit, don't show the button
                    if (branch && !!branch.pullRequests
                        && branch.pullRequests.filter((pr: any) => pr.state === "open").length > 0) {
                        showButton = false;
                    } else if (branch && !!branch.pullRequests) {
                        branch.pullRequests.forEach((pr: any) => {
                            if (pr.commits.filter((c: any) => c.sha === node.after.sha).length > 0) {
                                showButton = false;
                            }
                        });
                    }

                    if (showButton) {
                        const msg = node.after.message.split("\n");
                        let body = null;
                        if (msg.length > 1) {
                            body = msg.slice(1).join("\n").split("\r\n").join("\n").split("\r").join("");
                        }

                        buttons.push(buttonForCommand(
                            {
                                text: "Raise PR",
                                role: "global",
                            },
                            "RaiseBitbucketPullRequest", {
                                org: repo.owner,
                                repo: repo.name,
                                title: msg[0],
                                body,
                                base: node.repo.defaultBranch,
                                head: node.branch,
                            }));
                    }
                    return buttons;
                })
                .catch(err => {
                    logger.error("Error occurred running GraphQL query: %s", err);
                    return [];
                });
        } else {
            return Promise.resolve([]);
        }
    }

    public menusFor(node: graphql.PushToPushLifecycle.Push, context: RendererContext): Promise<Action[]> {
        return Promise.resolve([]);
    }
}

export class CancelGoalSetActionContributor extends AbstractIdentifiableContribution
    implements SlackActionContributor<GoalSet> {

    public renderingStyle: SdmGoalDisplayFormat;

    constructor() {
        super(LifecycleActionPreferences.push.cancel_goal_set.id);
    }

    public configure(configuration: LifecycleConfiguration): void {
        this.renderingStyle = configuration.configuration["rendering-style"] || SdmGoalDisplayFormat.full;
    }

    public supports(node: any): boolean {
        return node.goals && node.goalSetId;
    }

    public async buttonsFor(goalSet: GoalSet, context: RendererContext): Promise<Action[]> {
        const buttons = [];

        if (context.rendererId === "goals" && !!goalSet && !!goalSet.goals) {
            if (goalSet && goalSet.goals) {
                const goals = lastGoalSet(goalSet.goals).sort((g1, g2) => g1.name.localeCompare(g2.name));
                const push = context.lifecycle.extract("push") as PushFields.Fragment;

                // Add cancel button for in-flight goal sets
                if (isFullRenderingEnabled(this.renderingStyle, context) && goals.some(g =>
                    [SdmGoalState.in_process,
                        SdmGoalState.requested,
                        SdmGoalState.planned,
                        SdmGoalState.waiting_for_approval,
                        SdmGoalState.approved,
                        SdmGoalState.waiting_for_pre_approval,
                        SdmGoalState.pre_approved].includes(g.state))) {

                    buttons.push(buttonForCommand({
                        text: "Cancel",
                        confirm: {
                            title: "Cancel Goal Set",
                            text: `Do you really want to cancel goal set ${goalSet.goalSetId.slice(0, 7)} on commit ${
                                push.after.sha.slice(0, 7)} of ${push.repo.owner}/${push.repo.name}?`,
                            dismiss_text: "No",
                            ok_text: "Yes",
                        },
                    }, "CancelGoalSets", { goalSetId: goalSet.goalSetId }));
                }
            }
        }

        return Promise.resolve(buttons);
    }

    public menusFor(goalSet: GoalSet, context: RendererContext): Promise<Action[]> {
        return Promise.resolve([]);
    }
}

export class ApproveGoalActionContributor extends AbstractIdentifiableContribution
    implements SlackActionContributor<GoalSet> {

    public renderingStyle: SdmGoalDisplayFormat;

    constructor() {
        super(LifecycleActionPreferences.push.approve_goal.id);
    }

    public configure(configuration: LifecycleConfiguration): void {
        this.renderingStyle = configuration.configuration["rendering-style"] || SdmGoalDisplayFormat.full;
    }

    public supports(node: any): boolean {
        return node.goals && node.goalSetId;
    }

    public async buttonsFor(goalSet: GoalSet, context: RendererContext): Promise<Action[]> {
        const buttons: Action[] = [];

        if (context.rendererId === "goals") {
            if (goalSet && goalSet.goals) {
                const goals = lastGoalSet(goalSet.goals).sort((g1, g2) => g1.name.localeCompare(g2.name));
                goals.filter(g => g.state === SdmGoalState.failure)
                    .filter(g => g.retryFeasible === true)
                    .forEach(g => this.createButton(SdmGoalState.requested, "Restart", g, buttons));
                goals.filter(g => g.state === SdmGoalState.waiting_for_pre_approval)
                    .forEach(g => this.createButton(SdmGoalState.pre_approved, "Start", g, buttons));
                goals.filter(g => g.state === SdmGoalState.waiting_for_approval)
                    .forEach(g => this.createButton(SdmGoalState.approved, "Approve", g, buttons));
            }
        }

        return Promise.resolve(buttons);
    }

    public menusFor(goalSet: GoalSet, context: RendererContext): Promise<Action[]> {
        return Promise.resolve([]);
    }

    private createButton(state: SdmGoalState,
                         label: string,
                         goal: graphql.PushFields.Goals,
                         buttons: any[]): void {

        // Add the approve button
        const handler = new UpdateSdmGoalState();
        handler.id = goal.id;
        handler.state = state;
        (handler as any).__atomist_github_owner = goal.repo.owner;

        const name = goal.name.replace(/`/g, "");

        buttons.push(buttonForCommand(
            {
                text: `${label} _${name}_`,
                role: "global",
            },
            handler));
    }
}

export class ExpandAttachmentsActionContributor extends AbstractIdentifiableContribution
    implements SlackActionContributor<GoalSet> {

    public renderingStyle: SdmGoalDisplayFormat;

    constructor() {
        super("expand_attachments");
    }

    public configure(configuration: LifecycleConfiguration): void {
        this.renderingStyle = configuration.configuration["rendering-style"] || SdmGoalDisplayFormat.full;
    }

    public supports(node: any): boolean {
        return !!node.after;
    }

    public async buttonsFor(goalSet: GoalSet, context: RendererContext): Promise<Action[]> {
        const buttons: Action[] = [];
        const push = context.lifecycle.extract("push") as PushFields.Fragment;
        const displayState = _.get(push, "goalsDisplayState[0].state") || SdmGoalDisplayState.show_current;

        const shouldChannelExpand = context.lifecycle.renderers.some(
            r => r.id() === LifecycleRendererPreferences.push.expand.id);
        const displayFormat = _.get(push, "goalsDisplayState[0].format") || this.renderingStyle;

        if (context.rendererId === "expand_attachments" && !shouldChannelExpand) {
            if (this.renderingStyle === SdmGoalDisplayFormat.compact) {
                if (displayFormat === SdmGoalDisplayFormat.full) {
                    this.createButton(
                        displayState,
                        SdmGoalDisplayFormat.compact,
                        `Less \u02C4`,
                        push,
                        buttons);
                } else {
                    this.createButton(
                        displayState,
                        SdmGoalDisplayFormat.full,
                        `More \u02C5`,
                        push,
                        buttons);
                }
            }
        }

        return Promise.resolve(buttons);
    }

    public menusFor(goalSet: GoalSet, context: RendererContext): Promise<Action[]> {
        return Promise.resolve([]);
    }

    private createButton(state: SdmGoalDisplayState,
                         format: SdmGoalDisplayFormat,
                         label: string,
                         push: PushFields.Fragment,
                         buttons: any[]): void {

        const handler = new UpdateSdmGoalDisplayState();
        handler.state = state;
        handler.format = format;
        handler.owner = push.repo.owner;
        handler.name = push.repo.name;
        handler.providerId = push.repo.org.provider.providerId;
        handler.branch = push.branch;
        handler.sha = push.after.sha;

        buttons.push(buttonForCommand(
            {
                text: label,
            },
            handler));
    }
}

export class DisplayGoalActionContributor extends AbstractIdentifiableContribution
    implements SlackActionContributor<GoalSet> {

    public renderingStyle: SdmGoalDisplayFormat;

    constructor() {
        super(LifecycleActionPreferences.push.display_goals.id);
    }

    public configure(configuration: LifecycleConfiguration): void {
        this.renderingStyle = configuration.configuration["rendering-style"] || SdmGoalDisplayFormat.full;
    }

    public supports(node: any): boolean {
        return node.goals && node.goalSetId;
    }

    public async buttonsFor(goalSet: GoalSet, context: RendererContext): Promise<Action[]> {
        const buttons: Action[] = [];
        const goalSets = context.lifecycle.extract("goalSets") as GoalSet[];
        const push = context.lifecycle.extract("push") as PushFields.Fragment;
        const displayState = _.get(push, "goalsDisplayState[0].state") || SdmGoalDisplayState.show_current;
        const displayFormat = _.get(push, "goalsDisplayState[0].format") || this.renderingStyle;
        const goalSetIndex = goalSets.findIndex(gs => gs.goalSetId === goalSet.goalSetId);

        if (context.rendererId === "goals") {
            if (goalSets.length > 1) {
                const count = goalSets.length - 1;

                if (displayState === SdmGoalDisplayState.show_current) {
                    // Show more button
                    this.createButton(
                        SdmGoalDisplayState.show_all,
                        displayFormat,
                        `${count} additional goal ${count > 1 ? "sets" : "set"} \u02C5`,
                        push,
                        buttons);
                } else if (goalSetIndex === goalSets.length - 1) {
                    // Show hide button
                    this.createButton(
                        SdmGoalDisplayState.show_current,
                        displayFormat,
                        `${count} additional goal ${count > 1 ? "sets" : "set"} \u02C4`,
                        push,
                        buttons);
                }
            }
        }

        return Promise.resolve(buttons);
    }

    public menusFor(goalSet: GoalSet, context: RendererContext): Promise<Action[]> {
        return Promise.resolve([]);
    }

    private createButton(state: SdmGoalDisplayState,
                         format: SdmGoalDisplayFormat,
                         label: string,
                         push: PushFields.Fragment,
                         buttons: any[]): void {

        const handler = new UpdateSdmGoalDisplayState();
        handler.state = state;
        handler.format = format;
        handler.owner = push.repo.owner;
        handler.name = push.repo.name;
        handler.providerId = push.repo.org.provider.providerId;
        handler.branch = push.branch;
        handler.sha = push.after.sha;

        buttons.push(buttonForCommand(
            {
                text: label,
            },
            handler));
    }
}
