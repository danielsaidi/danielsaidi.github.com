/**
 *
 * HTML5 Audio player with playlist
 *
 * Licensed under the MIT license.
 * http://www.opensource.org/licenses/mit-license.php
 * 
 * Copyright 2012, Script Tutorials
 * http://www.script-tutorials.com/
 */
jQuery(document).ready(function() {

    // inner variables
    var song;
    var tracker = $('.music-player .tracker');
    var volume = $('.music-player .volume');

    function initAudio(elem) {
        var url = elem.attr('audiourl');
        var title = elem.text();
        var cover = elem.attr('cover');
        var artist = elem.attr('artist');

        $('.music-player .title').text(title);
        $('.music-player .artist').text(artist);
        $('.music-player .cover').css('background-image','url(' + cover+')');;

        song = new Audio(url);

        // timeupdate event listener
        song.addEventListener('timeupdate',function (){
            var curtime = parseInt(song.currentTime, 10);
            tracker.slider('value', curtime);
        });

        $('.playlist li').removeClass('active');
        elem.addClass('active');
    }

    function playAudio() {
        song.play();
        tracker.slider("option", "max", song.duration);

        $('.music-player .play').addClass('hidden');
        $('.music-player .pause').addClass('visible');
    }
    function stopAudio() {
        song.pause();

        $('.music-player .play').removeClass('hidden');
        $('.music-player .pause').removeClass('visible');
    }

    // play click
    $('.music-player .play').click(function (e) {
        e.preventDefault();

        playAudio();
    });

    // pause click
    $('.music-player .pause').click(function (e) {
        e.preventDefault();

        stopAudio();
    });

    // forward click
    $('.music-player .fwd').click(function (e) {
        e.preventDefault();

        stopAudio();

        var next = $('.playlist li.active').next();
        if (next.length == 0) {
            next = $('.playlist li:first-child');
        }
        initAudio(next);
    });

    // custom index click
    $('.music-player-link').click(function (e) {
        e.preventDefault();
        stopAudio();
        var rel = $(this).attr('rel');
        var link = $('.playlist li').get(parseInt(rel));
        initAudio($(link));
        playAudio();
    });

    // rewind click
    $('.music-player .rew').click(function (e) {
        e.preventDefault();

        stopAudio();

        var prev = $('.playlist li.active').prev();
        if (prev.length == 0) {
            prev = $('.playlist li:last-child');
        }
        initAudio(prev);
    });

    // show playlist
    $('.music-player .pl').click(function (e) {
        e.preventDefault();

        $('.playlist').fadeIn(300);
    });

    // playlist elements - click
    $('.playlist li').click(function () {
        stopAudio();
        initAudio($(this));
    });

    // initialization - first element in playlist
    initAudio($('.playlist li:first-child'));

    // set volume
    song.volume = 0.8;

    // initialize the volume slider
    /*volume.slider({
        range: 'min',
        min: 1,
        max: 100,
        value: 80,
        start: function(event,ui) {},
        slide: function(event, ui) {
            song.volume = ui.value / 100;
        },
        stop: function(event,ui) {},
    });*/

    // empty tracker slider
    tracker.slider({
        range: 'min',
        min: 0, max: 10,
        start: function(event,ui) {},
        slide: function(event, ui) {
            song.currentTime = ui.value;
        },
        stop: function(event,ui) {}
    });
});
