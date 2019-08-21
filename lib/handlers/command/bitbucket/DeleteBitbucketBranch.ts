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
    HandlerContext,
    HandlerResult,
    MappedParameter,
    MappedParameters,
    Parameter,
    Secret,
    Secrets,
    Success,
    Tags,
} from "@atomist/automation-client";
import { ConfigurableCommandHandler } from "@atomist/automation-client/lib/decorators";
import { HandleCommand } from "@atomist/automation-client/lib/HandleCommand";
import {
    bitbucketApi,
    getBitbucketAuth,
    handleError,
} from "./bitbucketApi";

@ConfigurableCommandHandler("Deletes a Bitbucket branch", {
    intent: [ "delete bitbucket branch" ],
    autoSubmit: true,
})
@Tags("bitbucket", "branch")
export class DeleteBitbucketBranch implements HandleCommand {

    @Parameter({ description: "branch name", pattern: /^.*$/ })
    public branch: string;

    @MappedParameter(MappedParameters.GitHubRepository)
    public repo: string;

    @MappedParameter(MappedParameters.GitHubOwner)
    public owner: string;

    @MappedParameter(MappedParameters.GitHubApiUrl)
    public apiUrl: string;

    public handle(ctx: HandlerContext): Promise<HandlerResult> {
        const auth = getBitbucketAuth();
        return bitbucketApi(this.apiUrl, auth)
            .deleteBranch({
                project: this.owner,
                repo: this.repo,
                branchName: `heads/${this.branch.trim()}`,
            }).then(() => Success)
            .catch(err => {
                return handleError("Delete Branch or Reference", err, ctx);
            });
    }
}
