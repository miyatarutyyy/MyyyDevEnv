;;; my-daily-console.el --- Daily console buffer -*- lexical-binding: t; -*-

(require 'calendar)
(require 'memorandum)

(defgroup my-daily-console nil
  "A reusable dashboard buffer for daily information."
  :group 'convenience)

(defconst my-daily-console--month-names
  ["January" "February" "March" "April" "May" "June"
   "July" "August" "September" "October" "November" "December"]
  "English month names used by the Daily Console.")

(defconst my-daily-console--weekdays '("MO" "TU" "WE" "TH" "FR" "SA" "SU")
  "English weekday labels, with Monday as the first day of the week.")

(defvar my-daily-console--current-time nil
  "Time snapshot used while rendering all Daily Console components.")

(defface my-daily-console-today-face
  '((t (:foreground "#ff0000" :weight bold)))
  "Face used to highlight today's date in the calendar."
  :group 'my-daily-console)

(defcustom my-daily-console-components
  '(my-daily-console-insert-calendar
    my-daily-console-insert-date-time)
  "Functions that insert components into the Daily Console buffer.
Each function is called with the current buffer writable and should insert its
own content."
  :type '(repeat function)
  :group 'my-daily-console)

(defvar-local my-daily-console--refresh-timer nil
  "Timer that refreshes this Daily Console buffer.")

(defun my-daily-console--date-parts ()
  "Return decoded date and time parts for the current render snapshot."
  (decode-time (or my-daily-console--current-time (current-time))))

(defun my-daily-console-insert-calendar ()
  "Insert the full current month calendar with Monday-first weeks."
  (pcase-let* ((`(,_second ,_minute ,_hour ,day ,month ,year . ,_rest)
                (my-daily-console--date-parts))
               (first-weekday (calendar-day-of-week (list month 1 year)))
               (leading-cells (mod (1- first-weekday) 7))
               (last-day (calendar-last-day-of-month month year))
               (cell-count (+ leading-cells last-day)))
    (insert (format "%s %d\n" (aref my-daily-console--month-names (1- month)) year)
            (make-string 28 ?-) "\n"
            (mapconcat (lambda (weekday) (format "%-4s" weekday))
                       my-daily-console--weekdays "")
            "\n")
    (dotimes (_ leading-cells)
      (insert "    "))
    (dotimes (index last-day)
      (let ((date (1+ index)))
        (when (< date 10)
          (insert " "))
        (insert (if (= date day)
                    (propertize (number-to-string date)
                                'face 'my-daily-console-today-face)
                  (number-to-string date))
                "  "))
      (when (= (% (+ leading-cells index 1) 7) 0)
        (insert "\n")))
    (unless (= (% cell-count 7) 0)
      (insert "\n"))
    (insert (make-string 28 ?-) "\n")))

(defun my-daily-console-insert-date-time ()
  "Insert today's date and current time in English."
  (pcase-let ((`(,second ,minute ,hour ,day ,month ,year . ,_rest)
               (my-daily-console--date-parts)))
    (insert (format "%s %d, %d / %02d:%02d:%02d\n"
                    (aref my-daily-console--month-names (1- month))
                    day year hour minute second))))

(defun my-daily-console--render ()
  "Render all configured components in the current Daily Console buffer."
  (when (derived-mode-p 'my-daily-console-mode)
    ;; `defface' alone can leave this face unspecified on graphical frames,
    ;; especially when the theme is loaded after this module.
    (set-face-attribute 'my-daily-console-today-face nil
                        :foreground "#ff0000" :weight 'bold)
    (let ((inhibit-read-only t)
          (my-daily-console--current-time (current-time)))
      (erase-buffer)
      (dolist (component my-daily-console-components)
        (funcall component))
      (goto-char (point-min))
      (set-buffer-modified-p nil))))

(defun my-daily-console--stop-refresh ()
  "Cancel the refresh timer for the current buffer."
  (when (timerp my-daily-console--refresh-timer)
    (cancel-timer my-daily-console--refresh-timer))
  (setq my-daily-console--refresh-timer nil))

(defun my-daily-console--start-refresh ()
  "Start the per-second refresh timer for the current buffer."
  (unless (timerp my-daily-console--refresh-timer)
    (setq my-daily-console--refresh-timer
          (run-at-time 0 1 #'my-daily-console--refresh-buffer (current-buffer)))))

(defun my-daily-console--refresh-buffer (buffer)
  "Refresh BUFFER if it is still a live Daily Console buffer."
  (when (buffer-live-p buffer)
    (with-current-buffer buffer
      (when (derived-mode-p 'my-daily-console-mode)
        (my-daily-console--render)))))

(defvar my-daily-console-mode-map
  (let ((map (make-sparse-keymap)))
    (set-keymap-parent map special-mode-map)
    (define-key map (kbd "q") #'quit-window)
    map)
  "Keymap for `my-daily-console-mode'.")

(define-derived-mode my-daily-console-mode special-mode "Daily-Console"
  "Major mode for the read-only Daily Console buffer."
  (add-hook 'kill-buffer-hook #'my-daily-console--stop-refresh nil t))

(defun my-daily-console-open ()
  "Display the Daily Console buffer in the registered main window."
  (interactive)
  (let ((buffer (get-buffer-create "*my-daily-console*")))
    (with-current-buffer buffer
      (unless (derived-mode-p 'my-daily-console-mode)
        (my-daily-console-mode))
      (my-daily-console--render)
      (my-daily-console--start-refresh))
    (set-window-buffer (memorandum--main-window) buffer)
    buffer))

(provide 'my-daily-console)
;;; my-daily-console.el ends here
