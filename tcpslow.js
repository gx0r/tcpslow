#!/usr/bin/env node
'use strict';
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

var net = require('net');
var chalk = require('chalk');
var path = require('path');
var program = require('commander');
var packagejson = require('./package.json');

program
    .version(packagejson.version)
    .description('Delay packets')
    .option('-l, --listen [port]', 'TCP port to listen on', parseInt)
    .option('-L, --listenuds [filename]', 'Unix domain socket to listen on')
    .option('-f, --forward [port]', 'TCP port to forward to', parseInt)
    .option('-F, --forwarduds [filename]', 'Unix domain socket to forward to')
    .option('-d, --delay [ms]', 'Optional milliseconds to delay', parseInt)
    .option('-h, --host [hostname]', 'Hostname of remote. Cannot be used with -F')
    .option('-v, --verbose', 'Log connection events')
    .option('-p, --packet', 'Log data transmitted')
    .option('-s, --sending', 'Delay packet sending in addition to receiving', false)
    .option('-i, --faultinjection', 'Add random socket close faults', false)
    .parse(process.argv);

if (program.listen && program.listenuds) {
    console.error('Can\'t listen on a TCP and a Unix domain socket');
    program.help();
}

if (program.forward && program.forwarduds) {
    console.error('Can\'t forward to a TCP port and a Unix domain socket');
    program.help();
}

if (program.host && program.forwarduds) {
    console.error('Can\'t use a hostname with a forwarding Unix domain socket');
    program.help();
}

if (!(program.listen || program.listenuds)) {
    console.error('Need a listening port');
    program.help();
}

if (!(program.forward || program.forwarduds)) {
    console.error('Need a forwarding port');
    program.help();
}

// normalize path strings
if (program.forwarduds) {
    program.forwarduds = path.normalize(program.forwarduds);
}

if (program.listenuds) {
    program.listenuds = path.normalize(program.listenuds);
}

function createConnection() {
    var conn;

    if (program.host || program.forward) {
        conn = {};
        conn.port = program.forward;
        if (program.host) {
            conn.host = program.host;
        } else {
            conn.host = 'localhost';
        }
        return net.createConnection(conn);
    } else {
        return net.createConnection(path.normalize(program.forwarduds));
    }
}

function logSocketStatus(status, socket) {
    if (program.verbose) {
        console.log(new Date() + ' local: ' + socket.localAddress + ':' + socket.localPort + ' remote: ' + socket.remoteAddress + ':' + socket.remotePort + ' | ' + status);
    }
}

var server = net.createServer(function(listen) {
    logSocketStatus('(listening) client connected', listen);

    listen.forward = createConnection();
    listen.forward.on('connect', function() {
        // if (program.verbose) console.log(new Date() + ' (forwarding) client connected.');
        logSocketStatus('(forwarding) client connected.', listen.forward);
    });
    listen.forward.on('data', function(data) {
        if (program.packet) console.log(chalk.red(data))
        setTimeout(function() {
            listen.write(data);
        }, program.delay);
    });
    listen.forward.on('error', function(err) {
        // if (program.verbose) console.log(new Date() + ' (forwarding) error ' + err);
        logSocketStatus('(forwarding) error ' + err, listen.forward);
        listen.destroy();
    });
    listen.forward.on('end', function() {
        // if (program.verbose) console.log(new Date() + ' (forwarding) client end.');
        logSocketStatus('(forwarding) end ', listen.forward);
        listen.end();
    });
    listen.forward.on('close', function(closed) {
        // if (program.verbose) console.log(new Date() + ' (forwarding) client close.');
        logSocketStatus('(forwarding) close ', listen.forward);
        listen.end();
    })

    listen.on('data', function(data) {
        if (program.sending) {
            setTimeout(function() {
                listen.forward.write(data);
            }, program.delay);
        } else {
            listen.forward.write(data);
        }
        if (program.packet) console.log(chalk.blue(data));
    });
    listen.on('end', function() {
        // if (program.verbose) console.log(new Date() + ' (listening) socket end.');
        logSocketStatus(' (listening) end ', listen);
        listen.forward.end();
        listen.end();
    });
    listen.on('error', function(err) {
        // if (program.verbose) console.log(new Date() + ' (listening) error: ' + err);
        logSocketStatus(' (listening) error ', listen);
        listen.forward.destroy();
    });
    listen.on('close', function() {
        // var args = Array.prototype.slice.call(arguments);
        logSocketStatus(' (listening) close ', listen);
        // if (program.verbose) console.log(new Date() + ' (listening) close: ' + args);
        listen.forward.end();
    });

    if (program.faultinjection) {
        setInterval(function () {
            if (listen.forward) {
                listen.forward.destroy();
            }
        }, 0);
    }
});

server.listen(program.listen ? program.listen : program.listenuds, function() {
    console.log('tcpslow ' + packagejson.version);
    if (program.listen) {
        console.log('Listening on port ' + program.listen);
    } else {
        console.log('Listening on unix domain socket ' + program.listenuds);
    }
    console.log('Relaying to ' + (program.host ? program.host + ' ' : '') + 'port ' + program.forward);
    if (program.delay) {
        console.log(' delaying by ' + program.delay + 'ms' + (program.sending ? ' in both directions ' : ' on receive'));
    }
});
