// npm packages
const fs = require('fs');
const path = require('path');

const pythonDockerfile = () =>
  `FROM python:3
WORKDIR /usr/src/app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD [ "python", "./main.py" ]`;

exports.name = 'python';

exports.checkTemplate = async ({tempDockerDir}) => {
  try {
    const filesList = fs.readdirSync(tempDockerDir);
    return filesList.filter(file => file.includes('.py')).length > 0;
  } catch (e) {
    return false;
  }
};

exports.executeTemplate = async ({username, tempDockerDir, resultStream, util, docker}) => {
  try {
    const dockerfile = pythonDockerfile();
    const dfPath = path.join(tempDockerDir, 'Dockerfile');
    fs.writeFileSync(dfPath, dockerfile, 'utf-8');
    util.writeStatus(resultStream, {message: 'Deploying Python project..', level: 'info'});

    const buildRes = await docker.build({username, resultStream});
    util.logger.debug('Build result:', buildRes);

    if (
      buildRes.log
        .map(it => it.toLowerCase())
        .some(it => it.includes('error') || (it.includes('failed') && !it.includes('optional')))
    ) {
      util.logger.debug('Build log conains error!');
      util.writeStatus(resultStream, {message: 'Build log contains errors!', level: 'error'});
      resultStream.end('');
      return;
    }

    const containerInfo = await docker.start(Object.assign({}, buildRes, {username, resultStream}));
    util.logger.debug(containerInfo.Name);

    await util.cleanTemp();

    const containerData = docker.daemon.getContainer(containerInfo.Id);
    const container = await containerData.inspect();

    util.writeStatus(resultStream, {message: 'Deployment success!', deployments: [container], level: 'info'});
    resultStream.end('');
  } catch (e) {
    util.logger.debug('build failed!', e);
    util.writeStatus(resultStream, {message: e.error, error: e.error, log: e.log, level: 'error'});
    resultStream.end('');
  }
};
