'use strict';

const usb = require('usb')
    , buffer = require('buffer').Buffer
    , colors = require('colors/safe')
    ;

const vendor = {
    vid: 0x04d8,
    pid: 0x000c,
    name: 'UGSimple'
};

const ids = {
    firmwareVersion: [0x00, 'FIRWMARE VER'],
    manufacturerId:  [0xFE, 'MANUFACTURER ID'],
    seriesNumber:    [0x0E, 'SERIAL NUM'],
    queryDevices:    [0x34, 'DEVICES']
}

function deviceList () {
    var list;
    console.log(colors.bold.underline('USB devices:'));
    list = usb.getDeviceList();
    list.forEach(function (e) {
        var line;
        line = e.busNumber + ':' + e.deviceAddress + ' ' +
        e.deviceDescriptor.idVendor.toString(16) + ':' +
        e.deviceDescriptor.idProduct.toString(16);
        if (
            e.deviceDescriptor.idVendor === vendor.vid &&
            e.deviceDescriptor.idProduct === vendor.pid
        ) {
            line = colors.green(line);
        }
        console.log(line);
    });
}

function dump () {
    const theDevice = usb.findByIds(vendor.vid, vendor.pid);
    if (theDevice === undefined) {
        console.log(colors.red('GPIB cable is not connected'));
        return;
    }
    theDevice.open();
    theDevice.reset(err => {
        if (err) { throw err; }
        // console.log(theDevice);
        const theInterface = theDevice.interfaces[0];
        theInterface.claim();
        const outEndpoint = theInterface.endpoints[0];
        const inEndpoint = theInterface.endpoints[1];
        outEndpoint.transfer('START', err => {
            if (err) { throw err; }
            console.log('START');
        });
    });
}

function main () {

    const ep = {};

    function open (cb) {
        const theDevice = usb.findByIds(vendor.vid, vendor.pid);

        if (theDevice === undefined) {
            console.log(colors.red('GPIB cable is not connected'));
            return;
        }

        theDevice.open();
        theDevice.reset(err => {
            if (err) { throw err; }
            // console.log(theDevice);
            const theInterface = theDevice.interfaces[0];
            theInterface.claim();
            theInterface.endpoints.forEach(e => {
                ep[e.direction] = e;
            });
            cb();
        });
    }

    function deviceWrite (addr, data, cb) {
        const dat = buffer.concat([
            buffer.from([addr, data.length + 2]),
            buffer.from(data)
        ]);
        console.log('USB WRITE:', dat);
        ep.out.transfer(dat, cb);
    }

    function deviceRead (addr, cb) {
        ep.in.transfer(
            2048,
            (err, dat) => {
                if(err) { throw err; }
                console.log('USB  READ:', dat);
                cb(dat);
            }
        )
    }

    const idf = Object.keys(ids).reduce((res, key) => {
        const val = ids[key];
        const cmd = val[0];
        res[key] = function (cb) {
            const cb1 = function (dat) {
                // console.log(val[1], ':', dat.slice(2));
                cb(dat);
            };
            console.log(cmd);
            deviceWrite( // Request
                cmd,
                [],
                () => {
                    deviceRead( // Read
                        cmd,
                        cb1
                    );
                }
            );
        };
        return res;
    }, {});

    function write (addr, data, cb) {
        const res = buffer.concat([
             buffer.from([addr]),
             buffer.from(data)
        ]);
        console.log('WRITE CMD:', res);
        deviceWrite(0x32, res, cb); // send write command
    }

    function read (addr, delay, cb) {
        const baddr = buffer.from([addr]);
        deviceWrite(0x33, baddr, () => { // send read command
            setTimeout(() => { // sleep for delay
                deviceRead(0x33, dat => {
                    console.log('READ DATA:', dat);
                    cb(dat);
                });
            }, delay);
        });
    }

    return Object.assign({
        open: open,
        write: write,
        read: read
    }, idf);
}

module.exports = main;
