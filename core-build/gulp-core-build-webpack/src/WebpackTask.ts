// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as colors from 'colors';
import type * as Webpack from 'webpack';
import { GulpTask, IBuildConfig } from '@microsoft/gulp-core-build';
import * as Gulp from 'gulp';
import { EOL } from 'os';

/**
 * @public
 */
export interface IWebpackTaskConfig {
  /**
   * Path to a webpack config. A path to a config takes precedence over the "config" option.
   */
  configPath: string;

  /**
   * Webpack config object, or array of config objects for multi-compiler.
   * If a path is specified by "configPath," and it is valid, this option is ignored.
   */
  config?: Webpack.Configuration | Webpack.Configuration[];

  /**
   * An array of regular expressions or regular expression strings. If a warning matches any of them, it
   * will not be logged.
   */
  suppressWarnings?: (string | RegExp)[];

  /**
   * An instance of the webpack compiler object, useful for building with Webpack 2.X while GCB is still on 1.X.
   */
  webpack?: typeof Webpack;

  /**
   * If true, a summary of the compilation will be printed after it completes. Defaults to true.
   */
  printStats?: boolean;
}

/**
 * @public
 */
export interface IWebpackResources {
  webpack: typeof Webpack;
}

/**
 * @public
 */
export class WebpackTask<TExtendedConfig = {}> extends GulpTask<IWebpackTaskConfig & TExtendedConfig> {
  private _resources: IWebpackResources;

  public constructor(extendedName?: string, extendedConfig?: TExtendedConfig) {
    super(
      extendedName || 'webpack',
      {
        configPath: './webpack.config.js',
        suppressWarnings: [],
        printStats: true,
        ...extendedConfig
      } as any // eslint-disable-line @typescript-eslint/no-explicit-any
    );
  }

  public get resources(): IWebpackResources {
    if (!this._resources) {
      this._resources = {
        webpack: this.taskConfig.webpack || require('webpack')
      };
    }

    return this._resources;
  }

  public isEnabled(buildConfig: IBuildConfig): boolean {
    return super.isEnabled(buildConfig) && this.taskConfig.configPath !== null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public loadSchema(): any {
    return require('./webpack.schema.json');
  }

  public executeTask(gulp: typeof Gulp, completeCallback: (error?: string) => void): void {
    // eslint-disable-next-line
    const path = require('path');

    let webpackConfig: any; // eslint-disable-line @typescript-eslint/no-explicit-any

    if (this.taskConfig.configPath && this.fileExists(this.taskConfig.configPath)) {
      try {
        webpackConfig = require(this.resolvePath(this.taskConfig.configPath));
      } catch (err) {
        completeCallback(`Error parsing webpack config: ${this.taskConfig.configPath}: ${err}`);
        return;
      }
    } else if (this.taskConfig.config) {
      webpackConfig = this.taskConfig.config;
    } else {
      this._logMissingConfigWarning();
      completeCallback();
      return;
    }

    if (webpackConfig) {
      const webpack: typeof Webpack = this.taskConfig.webpack || require('webpack');
      if (parseInt(webpack.version) !== 5) {
        this.logWarning(
          `This version of gulp-core-build-webpack is designed to work with webpack 5. ` +
            `You are currently using webpack ${webpack.version}.`
        );
      }
      const startTime: number = new Date().getTime();
      const outputDir: string = this.buildConfig.distFolder;

      webpack(webpackConfig, (error, stats) => {
        if (!this.buildConfig.properties) {
          this.buildConfig.properties = {};
        }

        // eslint-disable-next-line dot-notation
        this.buildConfig.properties['webpackStats'] = stats;

        let statsResult: Webpack.StatsCompilation | undefined;
        try {
          statsResult = stats?.toJson({
            hash: false,
            source: false
          });
        } catch (e) {
          this.logError(`Error processing webpack stats: ${e}`);

          if (error) {
            // Log this here in case we didn't get a stats object because of an error. Otherwise log errors
            // from the stats object.
            this.logError(`Webpack error: ${error}`);
          }
        }

        if (statsResult) {
          if (statsResult.errors && statsResult.errors.length) {
            this.logError(`'${outputDir}':` + EOL + statsResult.errors.join(EOL) + EOL);
          }

          if (statsResult.warnings && statsResult.warnings.length) {
            const unsuppressedWarnings: Webpack.StatsError[] = [];
            const warningSuppressionRegexes: RegExp[] = (this.taskConfig.suppressWarnings || []).map(
              (regex: string) => {
                return new RegExp(regex);
              }
            );

            for (const warning of statsResult.warnings) {
              let suppressed: boolean = false;
              for (let i: number = 0; i < warningSuppressionRegexes.length; i++) {
                const suppressionRegex: RegExp = warningSuppressionRegexes[i];
                if (warning.message.match(suppressionRegex)) {
                  suppressed = true;
                  break;
                }
              }

              if (!suppressed) {
                unsuppressedWarnings.push(warning);
              }
            }

            if (unsuppressedWarnings.length > 0) {
              this.logWarning(
                `'${outputDir}':` +
                  EOL +
                  unsuppressedWarnings
                    .map(
                      (unsuppressedWarning) =>
                        (unsuppressedWarning.loc ? `${unsuppressedWarning.loc}: ` : '') +
                        unsuppressedWarning.message
                    )
                    .join(EOL) +
                  EOL
              );
            }
          }

          if (this.taskConfig.printStats) {
            const duration: number = new Date().getTime() - startTime;
            const statsResultChildren: Webpack.StatsCompilation[] = statsResult.children
              ? statsResult.children
              : [statsResult];

            for (const child of statsResultChildren) {
              if (child.chunks) {
                for (const chunk of child.chunks) {
                  if (chunk.files) {
                    for (const file of chunk.files) {
                      this.log(
                        `Bundled: '${colors.cyan(path.basename(file))}', ` +
                          `size: ${colors.magenta(chunk.size.toString())} bytes, ` +
                          `took ${colors.magenta(duration.toString(10))} ms.`
                      );
                    }
                  }
                }
              }
            }
          }
        }

        completeCallback();
      }); // endwebpack callback
    }
  }

  private _logMissingConfigWarning(): void {
    this.logWarning(
      'No webpack config has been provided. ' +
        'Create a webpack.config.js file ' +
        `or call webpack.setConfig({ configPath: null }) in your gulpfile.`
    );
  }
}
