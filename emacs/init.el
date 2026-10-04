;;; init.el --- Emacs configuration entry point -*- lexical-binding: t; -*-
;;
;; ==========================================================
;; Package Managing
;; =========================================================
;; 
;; Install external packages through straight.el, with their revisions fixed
;; by the repository's straight/versions/default.el.  The bootstrap version
;; controls the installer protocol; the lockfile pins straight.el itself.

(defvar bootstrap-version)
(let ((bootstrap-file
       (expand-file-name "straight/repos/straight.el/bootstrap.el"
                         user-emacs-directory))
      (bootstrap-version 7))
  (unless (file-exists-p bootstrap-file)
    (with-current-buffer
        (url-retrieve-synchronously
         "https://raw.githubusercontent.com/radian-software/straight.el/develop/install.el"
         'silent 'inhibit-cookies)
      (goto-char (point-max))
      (eval-print-last-sexp)))
  (load bootstrap-file nil 'nomessage))

;; Emacs 29 and newer include use-package.  Use that copy to avoid fetching a
;; second copy; declare future external packages with :straight t so their
;; installation and configuration stay together in this file.
(require 'use-package)

;; Keep visited files in sync when they change on disk outside Emacs.
(global-auto-revert-mode 1)

;; =========================================================
;;  UI: Ghostel and Herdr
;; =========================================================
;; Keep the agent terminal available as a stable part of the working layout.
;; The pinned Nix launcher supplies the matching native module.  Disable
;; downloads when that module is supplied, so using Ghostel cannot change it.
;;
(when-let ((module-dir (getenv "GHOSTEL_MODULE_DIRECTORY")))
  (setq ghostel-module-directory module-dir
        ghostel-module-auto-install nil))

;; Ghostel provides a full terminal emulator inside Emacs for interactive
;; shells and terminal applications that the built-in shell does not support.
;; Install only its Emacs package here; the native module is installed separately.
;;
(use-package ghostel
  :straight t)

;; =========================================================
;;  Non-UI: Editing and language tools
;; =========================================================
;;
;; The pinned Nix launcher provides these grammars.  TypeScript needs its
;; grammar for the Emacs built-in tree-sitter major modes.
;;
(when-let ((grammar-dir (getenv "EDITOR_TREE_SITTER_GRAMMARS")))
  (add-to-list (quote treesit-extra-load-path) grammar-dir))
(add-to-list (quote auto-mode-alist) (cons "\\.tsx$" (quote tsx-ts-mode)))
(add-to-list (quote auto-mode-alist) (cons "\\.ts$" (quote typescript-ts-mode)))
(when (locate-library "nix-mode")
  (require (quote nix-mode))
  (add-to-list (quote auto-mode-alist) (cons "\\.nix$" (quote nix-mode))))

;; Org PDF export uses LuaLaTeX from the pinned Nix environment by default.
;; Individual Org files can override this with #+LATEX_COMPILER:.
;;
(with-eval-after-load 'ox-latex
  (setq org-latex-compiler "lualatex"
        org-latex-pdf-process
        '("latexmk -f -pdf -%latex -interaction=nonstopmode -output-directory=%o %f"))
  (add-to-list 'org-latex-packages-alist
               '("" "luatexja" t ("lualatex"))))

;; Eglot uses the language servers on the pinned Nix launcher PATH.
;; Elisp and Org retain their built-in editing tools without an LSP server.
;;
(require (quote eglot))
(add-to-list (quote eglot-server-programs)
             (cons (quote nix-mode) (list "nixd")))
(add-to-list (quote eglot-server-programs)
             (cons (quote html-ts-mode)
                   (list "vscode-html-language-server" "--stdio")))
(dolist (hook (quote (typescript-ts-mode-hook tsx-ts-mode-hook
                      js-mode-hook js-ts-mode-hook
                      html-mode-hook html-ts-mode-hook
                      css-mode-hook css-ts-mode-hook
                      js-json-mode-hook json-mode-hook json-ts-mode-hook
                      python-mode-hook python-ts-mode-hook
                      nix-mode-hook c-mode-hook c-ts-mode-hook
                      sh-mode-hook bash-ts-mode-hook)))
  (add-hook hook (function eglot-ensure)))

;; =========================================================
;;  Non-UI: System commands
;; =========================================================
;;
(defun tarutyyyne-restart-emacs-daemon ()
  "Restart the Emacs user service after confirming."
  (interactive)
  (when (yes-or-no-p "Restart Emacs daemon? Active Ghostel processes will end. ")
    (let ((buffer (get-buffer-create "*restart-emacs*")))
      (with-current-buffer buffer
        (erase-buffer))
      (make-process
       :name "restart-emacs"
       :buffer buffer
       :command '("systemctl" "--user" "restart" "emacs.service")
       :sentinel
       (lambda (process _event)
         (when (memq (process-status process) '(exit signal))
           (if (and (eq (process-status process) 'exit)
                    (zerop (process-exit-status process)))
               (message "Emacs daemon restarted successfully.")
             (message "Emacs daemon restart failed; see *restart-emacs*."))))))))

;; =========================================================
;;  UI: Frame appearance and window layout
;; =========================================================
;; Allow Emacs frames to resize in pixel increments when the window manager maximizes them.
(setq frame-resize-pixelwise t)

;; Use PlemolJP for GUI frames; the Nix environment supplies the font.
(add-to-list (quote default-frame-alist) (cons (quote font) "PlemolJP-12"))
(add-hook (quote after-make-frame-functions)
          (lambda (frame)
            (when (display-graphic-p frame)
              (set-frame-font "PlemolJP-12" nil t frame))))

;; Each graphical frame has its own fontset, so set CJK fallbacks there.
(defun tarutyyyne-use-plemoljp-for-cjk (frame)
  "Use PlemolJP for Japanese and CJK characters in graphical FRAME."
  (when (display-graphic-p frame)
    (dolist (script '(han kana cjk-misc))
      (set-fontset-font nil script
                        (font-spec :family "PlemolJP")
                        frame))))

(add-hook 'after-make-frame-functions
          #'tarutyyyne-use-plemoljp-for-cjk)
(dolist (frame (frame-list))
  (tarutyyyne-use-plemoljp-for-cjk frame))


;; Bar:
;; Hide the menu bar, tool bar, and scroll bars.
(menu-bar-mode -1)
(tool-bar-mode -1)
(scroll-bar-mode -1)

;; Theme:
;; Load the retro-orange theme stored alongside this configuration.
(let ((theme-directory
       (expand-file-name "themes"
                         (file-name-directory
                          (or load-file-name buffer-file-name)))))
  (add-to-list 'custom-theme-load-path theme-directory))

(load-theme 'retro-orange t)

;; [TEMPORARY]
;; Show command and other completion candidates beside the minibuffer input,
;; which sits below the fixed window layout, instead of in the distant main area.
(icomplete-vertical-mode 1)

;; Window Layout:
(defun tarutyyyne-setup-window-layout (&optional frame)
  "Show *Main* on the right and the Herdr terminal on the left in FRAME."
  (let ((frame (or frame (selected-frame))))
    (when (and (frame-live-p frame)
               (not (eq (frame-parameter frame 'minibuffer) 'only)))
      (with-selected-frame frame
        (let* ((main-window (window-main-window frame))
               (main-buffer (get-buffer-create "*Main*"))
               (ghostel-buffer (get-buffer "*AI Agent*")))
          ;; Start an interactive Ghostel shell, then send Herdr through its
          ;; terminal after the shell has had time to initialize.
          (unless (and ghostel-buffer
                       (with-current-buffer ghostel-buffer
                         (derived-mode-p 'ghostel-mode)))
            (setq ghostel-buffer (ghostel-create "*AI Agent*"))
            (run-at-time
             1 nil
             (lambda (buffer)
               (when (buffer-live-p buffer)
                 (with-current-buffer buffer
                   (when (derived-mode-p 'ghostel-mode)
                     (ghostel-send-string "herdr\n")))))
             ghostel-buffer))
          (select-window main-window)
          (delete-other-windows main-window)
          ;; The main window fills the right half; Ghostel is a left side window.
          (set-window-buffer main-window main-buffer)
          (let ((ghostel-window
                 (display-buffer
                  ghostel-buffer
                  '((display-buffer-in-side-window)
                    (side . left)
                    (slot . 0)
                    (window-width . 0.5)))))
            (set-window-dedicated-p ghostel-window t))
          (select-window main-window))))))

;; Set up both the daemon's initial frame and each new GUI client frame.
(add-hook 'emacs-startup-hook #'tarutyyyne-setup-window-layout)
(add-hook 'after-make-frame-functions #'tarutyyyne-setup-window-layout)


;;; init.el ends here
