%% PianoSRS: write every note and rest LilyPond interprets, one tab-separated line each, to <output>.events:
%% kind, score (for files with several pieces or movements), staff (numbered in order of appearance), voice (a Voice context, numbered likewise), time (whole notes, as a
%% fraction), bar number, position in the bar, then for notes: step (0 = C), alteration (in tones), octave (0 = the
%% octave from middle C), and for both: written length (log: 0 whole … 5 thirty-second), dots, tuplet scale, actual
%% length; then the staff's clef, key (fifths), and the time signature. Ties are their own lines. Grace notes are left out.
%% Each moment's events are written at the end of it, so a \key, \time or \clef set at the same moment (in a
%% simultaneous "global" part, say) has taken effect.

#(define pianosrs-port #f)
#(define (pianosrs-out)
   (or pianosrs-port
       (begin (set! pianosrs-port (open-output-file (string-append (ly:parser-output-name) ".events"))) pianosrs-port)))
#(define pianosrs-ids (make-hash-table))
#(define pianosrs-next (make-hash-table))
#(define (pianosrs-id ctx kind)
   (or (hashq-ref pianosrs-ids ctx)
       (let ((n (hashq-ref pianosrs-next kind 0)))
         (hashq-set! pianosrs-next kind (1+ n))
         (hashq-set! pianosrs-ids ctx n)
         n)))
#(define (rat r) (format #f "~a/~a" (numerator r) (denominator r)))
#(define (key-fifths staff)
   (let ((alts (ly:context-property staff 'keyAlterations '())))
     (apply + (map (lambda (a) (let ((v (cdr a))) (cond ((> v 0) 1) ((< v 0) -1) (else 0)))) alts))))
#(define (clef-name staff)
   (let ((g (ly:context-property staff 'clefGlyph "clefs.G")) (p (ly:context-property staff 'clefPosition 0)))
     (format #f "~a:~a" g p)))
#(define (time-sig ctx)
   (let ((f (ly:context-property ctx 'timeSignatureFraction '(4 . 4))))
     (if (pair? f) (format #f "~a/~a" (car f) (cdr f)) "4/4")))

#(define (pianosrs-line engraver event kind)
   (let* ((ctx (ly:translator-context engraver))
          (staff (ly:context-find ctx 'Staff))
          (now (ly:context-current-moment ctx))
          (d (ly:event-property event 'duration #f))
          (p (ly:event-property event 'pitch #f)))
     (if (and staff (equal? (ly:moment-grace now) 0) (or (eq? kind 'tie) d))
         (format (pianosrs-out) "~a\t~a\t~a\t~a\t~a\t~a\t~a\t~a\n"
                 kind
                 (pianosrs-id (ly:context-find ctx 'Score) 'score)
                 (pianosrs-id staff 'staff)
                 (pianosrs-id ctx 'voice)
                 (rat (ly:moment-main now))
                 (ly:context-property ctx 'currentBarNumber 1)
                 (rat (ly:moment-main (ly:context-property ctx 'measurePosition (ly:make-moment 0))))
                 (if (eq? kind 'tie)
                     ""
                     (format #f "~a\t~a\t~a\t~a\t~a\t~a\t~a\t~a\t~a\t~a"
                             (if (ly:pitch? p) (ly:pitch-notename p) "")
                             (if (ly:pitch? p) (ly:pitch-alteration p) "")
                             (if (ly:pitch? p) (ly:pitch-octave p) "")
                             (ly:duration-log d)
                             (ly:duration-dot-count d)
                             (ly:duration-scale d)
                             (rat (ly:moment-main (ly:duration-length d)))
                             (clef-name staff)
                             (key-fifths staff)
                             (time-sig ctx)))))
     (force-output (pianosrs-out))))

#(define (pianosrs-engraver context)
   (let ((heard '()))
     (make-engraver
      (listeners
       ((note-event engraver event) (set! heard (cons (cons event 'note) heard)))
       ((rest-event engraver event) (set! heard (cons (cons event 'rest) heard)))
       ((tie-event engraver event) (set! heard (cons (cons event 'tie) heard))))
      ((stop-translation-timestep engraver)
       (for-each (lambda (h) (pianosrs-line engraver (car h) (cdr h))) (reverse heard))
       (set! heard '())))))

\layout {
  \context { \Voice \consists #pianosrs-engraver }
}
