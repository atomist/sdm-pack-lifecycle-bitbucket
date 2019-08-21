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
    adaptHandleCommand,
    ExtensionPack,
    metadata,
} from "@atomist/sdm";
import {
    CardActionContributorWrapper,
    DefaultLifecycleRenderingOptions,
    LifecycleOptions,
    lifecycleSupport,
} from "@atomist/sdm-pack-lifecycle";
import {
    BranchFields,
    PullRequestFields,
    PushToPushLifecycle,
} from "@atomist/sdm-pack-lifecycle/lib/typings/types";
import deepmerge = require("deepmerge");
import { DeleteBitbucketBranch } from "./handlers/command/bitbucket/DeleteBitbucketBranch";
import { MergeBitbucketPullRequest } from "./handlers/command/bitbucket/MergeBitbucketPullRequest";
import { RaiseBitbucketPullRequest } from "./handlers/command/bitbucket/RaiseBitbucketPullRequest";
import { RaisePrActionContributor } from "./handlers/event/branch/rendering/BranchActionContributors";
import * as pra from "./handlers/event/pullrequest/rendering/PullRequestActionContributors";
import * as pa from "./handlers/event/push/rendering/PushActionContributors";

export const DefaultBitbucketLifecycleOptions: LifecycleOptions = deepmerge(DefaultLifecycleRenderingOptions, {
    branch: {
        chat: {
            actions: [
                (repo: BranchFields.Repo) => repo.org.provider.providerType === "bitbucket" ? [
                    new RaisePrActionContributor(),
                ] : [],
            ],
        },
    },
    pullRequest: {
        chat: {
            actions: [
                (repo: PullRequestFields.Repo) => repo.org.provider.providerType === "bitbucket" ? [
                    new pra.MergeActionContributor(),
                ] : [],
            ],
        },
        web: {
            actions: [
                (repo: PullRequestFields.Repo) => repo.org.provider.providerType === "bitbucket" ? [
                    new CardActionContributorWrapper(new pra.MergeActionContributor()),
                ] : [],
            ],
        },
    },
    push: {
        chat: {
            actions: [
                (push: PushToPushLifecycle.Push) => push.repo.org.provider.providerType === "bitbucket" ? [
                    new pa.PullRequestActionContributor(),
                    new pa.ApproveGoalActionContributor(),
                    new pa.CancelGoalSetActionContributor(),
                    new pa.DisplayGoalActionContributor(),
                    new pa.ExpandAttachmentsActionContributor(),
                ] : [],
            ],
        },
        web: {
            actions: [
                (push: PushToPushLifecycle.Push) => push.repo.org.provider.providerType === "bitbucket" ? [
                    new CardActionContributorWrapper(new pa.PullRequestActionContributor()),
                    new CardActionContributorWrapper(new pa.ApproveGoalActionContributor()),
                    new CardActionContributorWrapper(new pa.CancelGoalSetActionContributor()),
                ] : [],
            ],
        },
    },
    commands: [
        adaptHandleCommand(DeleteBitbucketBranch),
        adaptHandleCommand(MergeBitbucketPullRequest),
        adaptHandleCommand(RaiseBitbucketPullRequest),
    ],
});

export function bitbucketLifecycleSupport(): ExtensionPack {
    return {
        ...metadata(),
        configure: sdm => {
            sdm.addExtensionPacks(lifecycleSupport(DefaultBitbucketLifecycleOptions));
        },
    };
}
